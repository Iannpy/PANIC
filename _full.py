import os, subprocess, time, re
import numpy as np
import torch
from transformers import WhisperProcessor, WhisperForConditionalGeneration
from scipy.io import wavfile as wf

torch.set_num_threads(os.cpu_count() or 4)
SRC = r"C:\Users\DELL\Desktop\PANIC\pistas"
OUT = r"C:\Users\DELL\AppData\Local\Temp\opencode\panic_full"
os.makedirs(OUT, exist_ok=True)

MODEL = "openai/whisper-small.en"
proc = WhisperProcessor.from_pretrained(MODEL)
model = WhisperForConditionalGeneration.from_pretrained(MODEL); model.eval()
SR = 16000
WIN = 25          # segundos por ventana
STEP = 20         # solape 5s

def load(path):
    fd, tmp = tempfile_path()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ac", "1", "-ar", str(SR), tmp], check=True)
    sr, x = wf.read(tmp); os.remove(tmp)
    x = np.asarray(x, dtype=np.float64)
    if x.ndim > 1: x = x.mean(axis=1)
    if np.abs(x).max() > 1.5: x /= 32768.0
    return x

def tempfile_path():
    import tempfile
    fd, tmp = tempfile.mkstemp(suffix=".wav"); os.close(fd); return fd, tmp

files = sorted(f for f in os.listdir(SRC) if f.lower().endswith(".mpeg"))
for f in files:
    dest = os.path.join(OUT, f + ".txt")
    if os.path.exists(dest) and os.path.getsize(dest) > 50:
        print("cached:", f, flush=True); continue
    t0 = time.time()
    wav = load(os.path.join(SRC, f))
    dur = len(wav) / SR
    with open(dest, "w", encoding="utf-8") as fh:
        a = 0
        while a < dur - 3:
            chunk = wav[int(a*SR): int((a+WIN)*SR)]
            if len(chunk) < 2 * SR: break
            inp = proc(chunk, sampling_rate=SR, return_tensors="pt").input_features
            with torch.no_grad():
                ids = model.generate(inp, max_new_tokens=220, num_beams=1, do_sample=False)
            txt = proc.batch_decode(ids, skip_special_tokens=True)[0].strip()
            if txt:
                fh.write(f"[{int(a)//60:02d}:{int(a)%60:02d}] {txt}\n")
            a += STEP
    print(f"DONE {f}  ({dur:.0f}s audio, {time.time()-t0:.0f}s procesados)", flush=True)
print("ALL FINISHED")