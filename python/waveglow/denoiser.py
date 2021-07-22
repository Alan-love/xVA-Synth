import sys
sys.path.append('tacotron2')
import torch
# from common.layers import STFT
from python.common.layers import STFT


class Denoiser(torch.nn.Module):
    """ Removes model bias from audio produced with waveglow """

    def __init__(self, waveglow, device, filter_length=1024, n_overlap=4, win_length=1024, mode='zeros'):
        super(Denoiser, self).__init__()
        self.device = device
        self.stft = STFT(filter_length=filter_length, hop_length=int(filter_length/n_overlap), win_length=win_length, device=self.device).to(self.device)
        if mode == 'zeros':
            mel_input = torch.zeros(
                (1, 80, 88),
                dtype=waveglow.upsample.weight.dtype,
                device=waveglow.upsample.weight.device).to(self.device)
        elif mode == 'normal':
            mel_input = torch.randn(
                (1, 80, 88),
                dtype=waveglow.upsample.weight.dtype,
                device=waveglow.upsample.weight.device).to(self.device)
        else:
            raise Exception("Mode {} if not supported".format(mode))

        with torch.no_grad():
            bias_audio = waveglow.infer(mel_input.to(self.device), sigma=0.0).float()
            bias_spec, _ = self.stft.transform(bias_audio)

        self.register_buffer('bias_spec', bias_spec[:, :, 0][:, :, None])

    def forward(self, audio, strength=0.1):
        audio_spec, audio_angles = self.stft.transform(audio.to(self.device).float())
        audio_spec_denoised = audio_spec - self.bias_spec * strength
        audio_spec_denoised = torch.clamp(audio_spec_denoised, 0.0)
        audio_denoised = self.stft.inverse(audio_spec_denoised, audio_angles)
        return audio_denoised

    def set_device(self, device):
        self.device = device
        self = self.to(self.device)
        self.stft.set_device(self.device)

