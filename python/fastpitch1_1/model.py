import os
import re
import json
import argparse

import torch
import torch.nn as nn
from python.fastpitch1_1 import models

from scipy.io.wavfile import write
from torch.nn.utils.rnn import pad_sequence
from python.common.text import text_to_sequence, sequence_to_text

class FastPitch1_1(object):
    def __init__(self, logger, PROD, device, models_manager):
        super(FastPitch1_1, self).__init__()

        self.logger = logger
        self.PROD = PROD
        self.models_manager = models_manager
        self.device = device
        self.ckpt_path = None

        self.arpabet_dict = {}

        torch.backends.cudnn.benchmark = True

        self.init_model("english_basic")
        self.isReady = True


    def init_model (self, symbols_alphabet):

        parser = argparse.ArgumentParser(description='PyTorch FastPitch Inference', allow_abbrev=False)
        self.symbols_alphabet = symbols_alphabet

        model_parser = models.parse_model_args("FastPitch", symbols_alphabet, parser, add_help=False)
        model_args, model_unk_args = model_parser.parse_known_args()
        model_config = models.get_model_config("FastPitch", model_args)

        self.model = models.get_model("FastPitch", model_config, self.device, self.logger, forward_is_infer=True, jitable=False)
        self.model.eval()
        self.model.device = self.device

    def load_state_dict (self, ckpt_path, ckpt, n_speakers=1):

        self.ckpt_path = ckpt_path

        with open(ckpt_path.replace(".pt", ".json"), "r") as f:
            data = json.load(f)
            if "symbols_alphabet" in data.keys() and data["symbols_alphabet"]!=self.symbols_alphabet:
                self.logger.info(f'Changing symbols_alphabet from {self.symbols_alphabet} to {data["symbols_alphabet"]}')
                self.init_model(data["symbols_alphabet"])

        if 'state_dict' in ckpt:
            ckpt = ckpt['state_dict']

        symbols_embedding_dim = 384
        self.logger.info(f'n_speakers: {n_speakers}')
        if n_speakers is None or n_speakers==0:
            self.model.speaker_emb = None
        else:
            self.model.speaker_emb = nn.Embedding(1 if n_speakers is None else n_speakers, symbols_embedding_dim).to(self.device)

        self.model.load_state_dict(ckpt, strict=True)
        self.model = self.model.float()
        self.model.eval()


    def init_arpabet_dicts (self):
        if len(list(self.arpabet_dict.keys()))==0:
            self.refresh_arpabet_dicts()

    def refresh_arpabet_dicts (self):
        self.arpabet_dict = {}
        json_files = sorted(os.listdir(f'{"./resources/app" if self.PROD else "."}/arpabet'))
        json_files = [fname for fname in json_files if fname.endswith(".json")]

        for fname in json_files:
            with open(f'{"./resources/app" if self.PROD else "."}/arpabet/{fname}') as f:
                json_data = json.load(f)

                for word in list(json_data["data"].keys()):
                    if json_data["data"][word]["enabled"]==True:
                        self.arpabet_dict[word] = json_data["data"][word]["arpabet"]

    def infer_arpabet_dict (self, sentence):
        words = list(self.arpabet_dict.keys())
        if len(words):

            # Pad out punctuation, to make sure they don't get used in the word look-ups
            sentence = " "+sentence.replace(",", " ,").replace(".", " .").replace("!", " !").replace("?", " ?")+" "

            for word in words:
                sentence = sentence.replace(f' {word} ', " {"+self.arpabet_dict[word]+"} ")

            # Undo the punctuation padding, to retain the original sentence structure
            sentence = sentence.replace(" ,", ",").replace(" .", ".").replace(" !", "!").replace(" ?", "?").strip()

        return sentence



    def infer_batch(self, plugin_manager, linesBatch, vocoder, speaker_i, old_sequence=None):
        print(f'Inferring batch of {len(linesBatch)} lines')

        sigma_infer = 0.9
        stft_hop_length = 256
        sampling_rate = 22050
        denoising_strength = 0.01

        text_sequences = []
        cleaned_text_sequences = []
        for record in linesBatch:
            text = record[0]
            text = re.sub(r'[^a-zA-Z\s\(\)\[\]0-9\?\.\,\!\'\{\}]+', '', text)
            text = self.infer_arpabet_dict(text)
            sequence = text_to_sequence(text, "english_basic", ['english_cleaners'])
            cleaned_text_sequences.append(sequence_to_text("english_basic", sequence))
            text = torch.LongTensor(sequence)
            text_sequences.append(text)

        text_sequences = pad_sequence(text_sequences, batch_first=True).to(self.device)

        with torch.no_grad():
            pace = torch.tensor([record[3] for record in linesBatch]).unsqueeze(1).to(self.device)
            pitch_data = None # Maybe in the future
            mel, mel_lens, dur_pred, pitch_pred, energy_pred, start_index, end_index = self.model.infer_advanced(self.logger, plugin_manager, cleaned_text_sequences, text_sequences, speaker_i=speaker_i, pace=pace, pitch_data=pitch_data, old_sequence=None)

            if "waveglow" in vocoder:

                self.models_manager.init_model(vocoder)
                audios = self.models_manager.models(vocoder).model.infer(mel, sigma=sigma_infer)
                audios = self.models_manager.models(vocoder).denoiser(audios.float(), strength=denoising_strength).squeeze(1)

                for i, audio in enumerate(audios):
                    audio = audio[:mel_lens[i].item() * stft_hop_length]
                    audio = audio/torch.max(torch.abs(audio))
                    output = linesBatch[i][4]
                    write(output, sampling_rate, audio.cpu().numpy())
                del audios
            else:
                self.models_manager.load_model("hifigan", f'{"./resources/app" if self.PROD else "."}/python/hifigan/hifi.pt' if vocoder=="qnd" else self.ckpt_path.replace(".pt", ".hg.pt"))

                y_g_hat = self.models_manager.models("hifigan").model(mel)
                audios = y_g_hat.view((y_g_hat.shape[0], y_g_hat.shape[2]))
                # audio = audio * 2.3026  # This brings it to the same volume, but makes it clip in places
                for i, audio in enumerate(audios):
                    audio = audio[:mel_lens[i].item() * stft_hop_length]
                    audio = audio.cpu().numpy()
                    audio = audio * 32768.0
                    audio = audio.astype('int16')
                    output = linesBatch[i][4]
                    write(output, sampling_rate, audio)

            del mel, mel_lens

        return ""

    def infer(self, plugin_manager, text, output, vocoder, speaker_i, pace=1.0, pitch_data=None, old_sequence=None):

        print(f'Inferring: "{text}" ({len(text)})')

        sigma_infer = 0.9
        stft_hop_length = 256
        sampling_rate = 22050
        denoising_strength = 0.01

        text = re.sub(r'[^a-zA-Z\s\(\)\[\]0-9\?\.\,\!\'\{\}]+', '', text)
        text = self.infer_arpabet_dict(text)
        sequence = text_to_sequence(text, "english_basic", ['english_cleaners'])
        cleaned_text = sequence_to_text("english_basic", sequence)
        text = torch.LongTensor(sequence)
        text = pad_sequence([text], batch_first=True).to(self.models_manager.device)

        with torch.no_grad():

            if old_sequence is not None:
                old_sequence = re.sub(r'[^a-zA-Z\s\(\)\[\]0-9\?\.\,\!\'\{\}]+', '', old_sequence)
                old_sequence = text_to_sequence(old_sequence, "english_basic", ['english_cleaners'])
                old_sequence = torch.LongTensor(old_sequence)
                old_sequence = pad_sequence([old_sequence], batch_first=True).to(self.models_manager.device)

            mel, mel_lens, dur_pred, pitch_pred, energy_pred, start_index, end_index = self.model.infer_advanced(self.logger, plugin_manager, [cleaned_text], text, speaker_i=speaker_i, pace=pace, pitch_data=pitch_data, old_sequence=old_sequence)

            if "waveglow" in vocoder:

                self.models_manager.init_model(vocoder)
                audios = self.models_manager.models(vocoder).model.infer(mel, sigma=sigma_infer)
                audios = self.models_manager.models(vocoder).denoiser(audios.float(), strength=denoising_strength).squeeze(1)

                for i, audio in enumerate(audios):
                    audio = audio[:mel_lens[i].item() * stft_hop_length]
                    audio = audio/torch.max(torch.abs(audio))
                    write(output, sampling_rate, audio.cpu().numpy())
                del audios
            else:
                self.models_manager.load_model("hifigan", f'{"./resources/app" if self.PROD else "."}/python/hifigan/hifi.pt' if vocoder=="qnd" else self.ckpt_path.replace(".pt", ".hg.pt"))

                y_g_hat = self.models_manager.models("hifigan").model(mel)
                audio = y_g_hat.squeeze()
                audio = audio * 32768.0
                # audio = audio * 2.3026  # This brings it to the same volume, but makes it clip in places
                audio = audio.cpu().numpy().astype('int16')
                write(output, sampling_rate, audio)
                del audio

            del mel, mel_lens

        [pitch, durations, energy] = [pitch_pred.squeeze().cpu().detach().numpy(), dur_pred.cpu().detach().numpy()[0], energy_pred.cpu().detach().numpy()[0]]
        pitch_durations_energy_text = ",".join([str(v) for v in pitch]) + "\n" + ",".join([str(v) for v in durations]) + "\n" + ",".join([str(v) for v in energy])

        del pitch_pred, dur_pred, energy_pred, text, sequence
        return pitch_durations_energy_text +"\n"+cleaned_text +"\n"+ f'{start_index}\n{end_index}'

    def set_device (self, device):
        self.device = device
        self.model = self.model.to(device)
        self.model.device = device


    def run_speech_to_speech (self, audiopath, text):
        return self.model.run_speech_to_speech(self.device, self.logger, audiopath, text, text_to_sequence, sequence_to_text)


