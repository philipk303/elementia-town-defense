"""FFmpeg/ffprobe SFX processing pipeline (docs/plans/2026-07-26-audio-asset-pipeline.md,
'sfx' profile: mono ogg under client/public/audio/sfx/). Ingests a raw Freesound download,
trims silence, applies short click-prevention fades, loudness-normalizes, and measures the
result. Every shipped SFX passes through this script rather than being hand-edited.

Usage:
    python tools/audio/process_sfx.py                  # process every 'sourced' ledger entry
    python tools/audio/process_sfx.py earth_sweep       # process one asset id
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "audio" / "assets-manifest.json"
OUT_DIR = ROOT / "client" / "public" / "audio" / "sfx"

# Target integrated loudness for one-shot combat/UI SFX. -16 LUFS is a
# common game-SFX target — loud enough to read over music, not so hot it
# clips or fights the mix. Single-pass loudnorm (not the two-pass measure
# -> apply form) is accurate enough for short one-shots; true EBU R128
# two-pass matters more for music-length material.
LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11"
# 5ms in/out fades prevent a sample-boundary click without being audible
# as a fade on anything longer than a snap transient.
FADE_MS = 5
# silenceremove trims leading/trailing near-digital-silence. -60dB is
# deliberately conservative (not the -40dB/-50dB a naive "silence" reading
# suggests): these raw downloads are un-normalized and several run quiet
# (mean -29dB on one measured source), so a shallower threshold reads real,
# audible soft attack/decay as "silence" and cuts it — verified by hand on
# earth_sweep_fs475133 (0.88s raw): -40dB cut to 0.29s, -50dB to 0.39s,
# -60dB to 0.59s. Only -60dB stays clearly on the "true dead air" side.
SILENCE_FILTER = (
    "silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.05,"
    "areverse,"
    "silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.05,"
    "areverse"
)


def ffprobe_info(path):
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        capture_output=True, text=True, check=True,
    )
    data = json.loads(out.stdout)
    stream = data["streams"][0]
    return {
        "duration_s": round(float(data["format"]["duration"]), 3),
        "channels": stream.get("channels"),
        "sample_rate": stream.get("sample_rate"),
    }


def process_one(raw_path, out_path, stereo=False):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fade_s = FADE_MS / 1000
    # Trim -> mono (or passthrough stereo for the 'stinger' profile) -> click-prevention
    # fades -> loudness normalize -> OGG/Vorbis. afade out uses a placeholder start time
    # (999) overridden by -shortest-friendly `afade=t=out:st=0:d=...` isn't duration-aware
    # up front, so the out-fade is applied via `areverse, afade in, areverse` to always
    # land exactly at the (now-trimmed) clip's true end regardless of its length.
    channel_step = "" if stereo else "pan=mono|c0=0.5*c0+0.5*c1,"
    filter_chain = (
        f"{SILENCE_FILTER},"
        f"{channel_step}"
        f"afade=t=in:st=0:d={fade_s},"
        f"areverse,afade=t=in:st=0:d={fade_s},areverse,"
        f"{LOUDNORM}"
    )
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(raw_path), "-af", filter_chain,
         "-c:a", "libvorbis", "-q:a", "4", str(out_path)],
        capture_output=True, text=True, check=True,
    )
    return ffprobe_info(out_path)


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    only_id = sys.argv[1] if len(sys.argv) > 1 else None
    results = []
    for asset in manifest["assets"]:
        prov = asset.get("provenance", {})
        if prov.get("status") != "sourced":
            continue
        if only_id and asset["id"] != only_id:
            continue
        raw = ROOT / prov["raw_path"]
        if not raw.exists():
            print(f"SKIP {asset['id']}: raw file missing at {raw}")
            continue
        out = OUT_DIR / f"{asset['id']}.ogg"
        stereo = asset.get("profile") == "stinger"
        try:
            info = process_one(raw, out, stereo=stereo)
        except subprocess.CalledProcessError as e:
            print(f"FAIL {asset['id']}: {e.stderr[-500:]}")
            continue
        size_kb = round(out.stat().st_size / 1024, 1)
        print(f"OK   {asset['id']:24s} {info['duration_s']:6.2f}s  {info['channels']}ch  {size_kb:7.1f}KB  -> {out.relative_to(ROOT)}")
        results.append({"id": asset["id"], **info, "size_bytes": out.stat().st_size})
    print(f"\n{len(results)} processed")
    return results


if __name__ == "__main__":
    main()
