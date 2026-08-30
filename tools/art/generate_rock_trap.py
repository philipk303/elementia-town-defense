"""Deterministically draw and pack the Rock Trap source frames and Phaser atlases."""
from pathlib import Path
from PIL import Image, ImageDraw
import json

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'art' / 'source' / 'rock-trap'
OUT = ROOT / 'client' / 'public' / 'art'
PAL = {'ink': '#302923', 'umber': '#62462c', 'soil': '#a76f36', 'ochre': '#d09a46', 'slate': '#66717a', 'light': '#aab1b5', 'gold': '#e7c35a'}

def px(im, rect, color): ImageDraw.Draw(im).rectangle(rect, fill=PAL[color])
def structure(state):
    im = Image.new('RGBA', (64, 32), (0, 0, 0, 0))
    # Compact 2×1-looking stone launcher; centered on the native 1×1 tile anchor.
    px(im, (2, 19, 61, 28), 'ink'); px(im, (4, 19, 59, 26), 'umber'); px(im, (7, 20, 56, 25), 'soil')
    for r in [(7,16,22,22),(25,13,39,22),(42,16,57,22)]: px(im, r, 'ink')
    for r in [(9,16,21,20),(27,13,37,20),(44,16,55,20)]: px(im, r, 'slate')
    px(im, (28, 5, 36, 15), 'ink'); px(im, (30, 6, 34, 14), 'ochre')
    if state == 'launch':
        px(im, (27,1,37,6), 'ink'); px(im, (29,1,35,5), 'slate')
    elif state == 'recovery':
        px(im, (25,8,39,12), 'ink'); px(im, (27,8,37,10), 'gold')
    return im

def effect(i):
    im = Image.new('RGBA', (48, 64), (0, 0, 0, 0))
    if i < 2: # restrained warning shadow
        px(im, (10,53,37,57), 'ink'); px(im, (13,53,34,55), 'gold')
    elif i < 5: # falling boulder
        y = 6 + (i - 2) * 13
        px(im, (14,y,33,y+17), 'ink'); px(im, (16,y+2,31,y+15), 'slate'); px(im, (19,y+3,26,y+7), 'light')
        px(im, (11,53,36,56), 'umber')
    else: # impact cluster
        spread = (i - 5) * 3
        px(im, (24-spread,48-spread,24+spread,56), 'ink'); px(im, (24-spread,49-spread,24+spread,54), 'ochre')
        for x,y in [(8,50),(39,49),(15,39),(33,38)]: px(im, (x,y,x+5,y+5), 'ink'); px(im, (x+1,y+1,x+4,y+4), 'slate')
    return im

def pack(name, frames):
    w = max(i.width for _, i in frames); h = max(i.height for _, i in frames)
    sheet = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0)); meta = {}
    for n, im in frames:
        x = len(meta) * w; sheet.alpha_composite(im, (x, 0))
        meta[n] = {'frame': {'x':x,'y':0,'w':w,'h':h}, 'rotated':False, 'trimmed':False,
                   'spriteSourceSize': {'x':0,'y':0,'w':w,'h':h}, 'sourceSize': {'w':w,'h':h}}
    sheet.save(OUT / f'{name}.png')
    (OUT / f'{name}.json').write_text(json.dumps({'frames':meta, 'meta':{'app':'rock-trap-pillow','image':f'{name}.png','format':'RGBA8888','size':{'w':sheet.width,'h':sheet.height},'scale':'1'}}, indent=2))

def main():
    SRC.mkdir(parents=True, exist_ok=True); OUT.mkdir(parents=True, exist_ok=True)
    states = ['idle','launch','recovery']
    frames = []
    for state in states:
        im = structure(state); im.save(SRC / f'earth_special_{state}.png'); frames.append((f'{state}_down_0.png', im))
    pack('earth_special', frames)
    fx = []
    for i in range(8):
        im = effect(i); im.save(SRC / f'rock_trap_fx_{i:02}.png'); fx.append((f'impact_down_{i}.png', im))
    pack('rock_trap_fx', fx)

if __name__ == '__main__': main()
