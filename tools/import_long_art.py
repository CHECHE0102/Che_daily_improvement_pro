"""Turn Codex PNGs into the webp files the long videos use (assets/art/lesson/niamh/).

usage: python tools/import_long_art.py person <name> <png>     -> <name>.webp   (e.g. person conor-talk conor-talk.png)
       python tools/import_long_art.py bg <name> <png>         -> <name>.webp   (e.g. bg bg-pub bg-pub.png)
A person is cropped to their outline and pasted on a transparent 900x1536 canvas, feet on the bottom edge, centred.
A background is cropped to 3:2 and resized to 1920x1280.
"""
import os, sys
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "art", "lesson", "niamh")


def main():
    kind, name, src = sys.argv[1:4]
    im = Image.open(src)
    if kind == "person":
        im = im.convert("RGBA")
        box = im.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox()
        if not box or (box[2] - box[0]) * (box[3] - box[1]) > 0.98 * im.width * im.height:
            sys.exit(f"{src}: no transparent background, remove the background first")
        im = im.crop(box)
        scale = min(880 / im.width, 1500 / im.height)
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        canvas = Image.new("RGBA", (900, 1536), (0, 0, 0, 0))
        canvas.alpha_composite(im, ((900 - im.width) // 2, 1536 - im.height))
        canvas.save(os.path.join(OUT, name + ".webp"), quality=88, method=6)
    elif kind == "bg":
        im = im.convert("RGB")
        w = min(im.width, round(im.height * 1.5)); h = round(w / 1.5)
        left, top = (im.width - w) // 2, (im.height - h) // 2
        im.crop((left, top, left + w, top + h)).resize((1920, 1280), Image.LANCZOS).save(os.path.join(OUT, name + ".webp"), quality=82, method=6)
    else:
        sys.exit(__doc__)
    print("wrote", os.path.normpath(os.path.join(OUT, name + ".webp")))


if __name__ == "__main__":
    main()
