import os
import ffmpeg
import traceback
import subprocess
from pydub import AudioSegment


import multiprocessing as mp

def mp_ffmpeg_output (PROD, logger, processes, input_paths, output_paths, options):

    workItems = []
    for ip, path in enumerate(input_paths):
        workItems.append([PROD, None, path, output_paths[ip], options])

    workers = processes if processes>0 else max(1, mp.cpu_count()-1)
    workers = min(len(workItems), workers)

    logger.info("[mp ffmpeg] workers: "+str(workers))

    pool = mp.Pool(workers)
    results = pool.map(processingTask, workItems)
    pool.close()
    pool.join()

    return "\n".join(results)

def processingTask(data):
    return run_audio_post(data[0], data[1], data[2], data[3], data[4])



def run_audio_post(PROD, logger, input, output, options=None):

    ffmpeg_path = f'{"./resources/app" if PROD else "."}/python/ffmpeg.exe'

    try:
        stream = ffmpeg.input(input)

        ffmpeg_options = {"ar": options["hz"]}

        ffmpeg_options["af"] = []
        if options["padStart"]:
            ffmpeg_options["af"].append(f'adelay={options["padStart"]}')
        if options["padEnd"]:
            ffmpeg_options["af"].append(f'apad=pad_dur={options["padEnd"]}ms')


        # Pitch
        ffmpeg_options["af"].append(f'asetrate={22050*(options["pitchMult"])},atempo=1/{options["pitchMult"]}')
        # Tempo
        ffmpeg_options["af"].append(f'atempo={options["tempo"]}')

        ffmpeg_options["af"].append(f'volume={options["amplitude"]}')
        ffmpeg_options["af"] = ",".join(ffmpeg_options["af"])


        if options["bit_depth"]:
            ffmpeg_options["acodec"] = options["bit_depth"]

        if "mp3" in output:
            ffmpeg_options["c:a"] = "libmp3lame"


        if os.path.exists(output):
            try:
                os.remove(output)
            except:
                pass

        stream = ffmpeg.output(stream, output, **ffmpeg_options)

        if logger!=None:
            logger.info("audio options: "+str(options))
            logger.info("ffmpeg command: "+ " ".join(stream.compile()))

        out, err = (ffmpeg.run(stream, cmd=ffmpeg_path, capture_stdout=True, capture_stderr=True, overwrite_output=True))

    except ffmpeg.Error as e:
        if logger!=None:
            logger.info("ffmpeg err: "+ e.stderr.decode('utf8'))
        return e.stderr.decode('utf8')
    except:
        if logger!=None:
            logger.info(traceback.format_exc())
        return traceback.format_exc().replace("\n", " ")

    return "-"


def prepare (PROD, logger, inputPath, outputPath, removeNoise, removeNoiseStrength):

    ffmpeg_path = f'{"./resources/app" if PROD else "."}/python/ffmpeg.exe'

    try:
        stream = ffmpeg.input(inputPath)
        ffmpeg_options = {"ar": 22050, "ac": 1}

        stream = ffmpeg.output(stream, outputPath, **ffmpeg_options)
        out, err = (ffmpeg.run(stream, cmd=ffmpeg_path, capture_stdout=True, capture_stderr=True, overwrite_output=True))

        # Remove silence if a silence clip has been provided
        if removeNoise and os.path.exists(f'{"./resources/app" if PROD else "."}/output/silence.wav'):
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

            # Create a silence noise profile if one does not yet exist
            if not os.path.exists(f'{"./resources/app" if PROD else "."}/output/noise_profile_file'):
                command = f'sox {"./resources/app" if PROD else "."}/output/silence.wav -n noiseprof {"./resources/app" if PROD else "."}/output/noise_profile_file'
                sox = subprocess.Popen(command, startupinfo=startupinfo, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                # sox.stdout.close()
                stdout, stderr = sox.communicate()
                stderr = stderr.decode("utf-8")
                if len(stderr):
                    logger.info(f'SOX Command: {command}')
                    logger.info(f'SOX ERROR: {stderr}')
                    return outputPath

            # Remove the background noise
            command = f'sox {outputPath} {outputPath.split(".wav")[0]}_sil.wav noisered {"./resources/app" if PROD else "."}/output/noise_profile_file {removeNoiseStrength}'
            sox = subprocess.Popen(command, startupinfo=startupinfo, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            stdout, stderr = sox.communicate()
            stderr = stderr.decode("utf-8")
            if len(stderr):
                logger.info(f'SOX Command: {command}')
                logger.info(f'SOX ERROR: {stderr}')
            else:
                outputPath = f'{outputPath.split(".wav")[0]}_sil.wav'

    except ffmpeg.Error as e:
        logger.info("[prepare] ffmpeg err: "+ e.stderr.decode('utf8'))

    return outputPath

def prepare_input_audio(PROD, logger, path, removeNoise, removeNoiseStrength):

    existing_files_dir = "/".join(path.split("/")[:-1])
    logger.info("existing_files_dir")
    logger.info(existing_files_dir)
    existing_files = [fname for fname in os.listdir("/".join(path.split("/")[:-1])) if fname.startswith("recorded_file_")]

    logger.info("existing_files")
    logger.info(",".join(existing_files))
    for file in existing_files:
        os.remove(f'{existing_files_dir}/{file}')



    output = f'{path.split(".wav")[0]}_prepared.wav'
    logger.info(f'output pre prepare: {output}')
    output = prepare(PROD, logger, path, output, removeNoise, removeNoiseStrength)
    logger.info(f'output post prepare: {output}')


    threshold = -40
    interval = 1

    audio = AudioSegment.from_wav(output)

    # break into chunks
    chunks = [audio[i:i+interval] for i in range(0, len(audio), interval)]
    trimmed_audio = []

    for ci, c in enumerate(chunks):
        if (c.dBFS == float('-inf') or c.dBFS < threshold):
            pass
        else:
            trimmed_audio = chunks[ci:]
            break

    combined_sound = sum(trimmed_audio, AudioSegment.empty())
    combined_sound = combined_sound.set_frame_rate(22050)
    final_path = f'{path.split(".wav")[0]}_post.wav'
    combined_sound.export(final_path, format="wav", bitrate=22050) # parameters=["-ac", "1"]


    final_path = f'{path.split(".wav")[0]}_post.wav'
    # final_path = f'{path.split(".wav")[0]}_prepared.wav'
    # logger.info(f'final_path: {final_path}')

    return final_path

def normalize_audio (input_path, output_path):
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

    sp = subprocess.Popen(f'ffmpeg-normalize -ar 22050 "{input_path}" -o "{output_path}"', startupinfo=startupinfo, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = sp.communicate()
    stderr = stderr.decode("utf-8")

    if len(stderr) and "duration of less than 3 seconds" not in stderr:
        print("stderr", stderr)
        return "stderr: "+ stderr

    return ""