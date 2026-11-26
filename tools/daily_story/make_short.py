"""python3 make_short.py <frames_dir> <audio_dir> <out.mp4>  — builds the 9:16 daily news Short."""
import subprocess, sys, os
F, A, OUT = sys.argv[1:4]
SC = [("intro", ["s1"]), ("n0", ["s2e", "s2z"]), ("n1", ["s3e", "s3z"]), ("n2", ["s4e", "s4z"]), ("regions", ["s5"]), ("cta", ["s6"])]
ZH_TEMPO, GAP, PAD, XF = 1.0, 0.1, 0.2, 0.2
def dur(p): return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",p]))
tmp = os.path.join(F, "_tmp"); os.makedirs(tmp, exist_ok=True); parts = []; lens = []
for i, (img, keys) in enumerate(SC):
    clips = []
    for k in keys:
        o = os.path.join(tmp, k + ".wav"); tempo = ZH_TEMPO if not k.endswith("e") else 1.0
        subprocess.run(["ffmpeg","-y","-v","error","-i",os.path.join(A,k+".mp3"),"-af",f"atempo={tempo},apad=pad_dur={GAP}","-ar","44100","-ac","2",o], check=True)
        clips.append(o)
    lead = os.path.join(tmp, f"lead{i}.wav")
    subprocess.run(["ffmpeg","-y","-v","error","-f","lavfi","-i","anullsrc=r=44100:cl=stereo","-t",str(XF if i else 0.2),lead], check=True)
    lst = os.path.join(tmp, f"l{i}.txt"); open(lst,"w").write("".join(f"file '{c}'\n" for c in [lead]+clips))
    a = os.path.join(tmp, f"a{i}.wav"); subprocess.run(["ffmpeg","-y","-v","error","-f","concat","-safe","0","-i",lst,"-af",f"apad=pad_dur={PAD}",a], check=True)
    d = dur(a); lens.append(d)
    v = os.path.join(tmp, f"v{i}.mp4")
    # gentle push-in so the frame is not fully static
    subprocess.run(["ffmpeg","-y","-v","error","-loop","1","-i",os.path.join(F,img+".png"),"-i",a,"-filter_complex",
      f"[0]scale=2160:3840,zoompan=z='1+0.03*on/({d}*30)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={int(d*30)+1}:s=1080x1920:fps=30,format=yuv420p[v]",
      "-map","[v]","-map","1","-t",str(d),"-c:v","libx264","-preset","medium","-crf","20","-c:a","aac","-b:a","160k",v], check=True)
    parts.append(v)
# crossfade scenes
inp = sum([["-i", p] for p in parts], []); fv = ""; fa = ""; off = 0; pv = "0:v"; pa = "0:a"
for i in range(1, len(parts)):
    off += lens[i-1] - XF
    fv += f"[{pv}][{i}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}[v{i}];"; pv = f"v{i}"
    fa += f"[{pa}][{i}:a]acrossfade=d={XF}[a{i}];"; pa = f"a{i}"
subprocess.run(["ffmpeg","-y","-v","error",*inp,"-filter_complex",fv+fa.rstrip(";"),"-map",f"[{pv}]","-map",f"[{pa}]",
  "-c:v","libx264","-preset","medium","-crf","20","-pix_fmt","yuv420p","-c:a","aac","-b:a","160k","-movflags","+faststart",OUT], check=True)
print("done", OUT, round(dur(OUT),2), "s")
