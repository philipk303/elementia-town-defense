"""FFmpeg/ffprobe music processing pipeline (docs/plans/2026-07-26-audio-asset-pipeline.md,
'music' profile: stereo mp3 under client/public/audio/music/). Ingests a raw Lyria-generated
track, applies short click-prevention fades (NOT aggressive silence trimming -- a loop needs
its exact boundaries preserved, not auto-trimmed), loudness-normalizes, and re-encodes at a
bitrate that keeps the full 9-track music set inside the pipeline's 10MB total-shipped-audio
budget alongside the already-shipped ~1.2MB of SFX.

Usage:
    python tools/audio/process_music.py                  # process every 'sourced' ledger entry
    python tools/audio/process_music.py build_calm        # process one asset id
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "audio" / "assets-manifest.json"
OUT_DIR = ROOT / "client" / "public" / "audio" / "music"

# Loop beds (build tiers, battle tiers, menu) AND the one-shot stingers
# (victory_final/defeat_final) are all shipped at their full raw length.
# 2026-08-10 user listen: the stingers cut off too abruptly at the earlier
# 12s trim -- reverted to the full ~30.7s clip-preview output (there's no
# mid-clip natural stop point to trim to anyway) and rely on BITRATE alone
# to control size; the 10MB total-shipped-audio budget has enough headroom
# (~1.9MB free even with these at full length) that no further bitrate cut
# was actually needed for these two specifically.
ONE_SHOT_IDS = {"victory_final", "defeat_final"}

# Same -16 LUFS target as tools/audio/process_sfx.py's SFX pipeline, for mix
# consistency across the whole game. Single-pass loudnorm (not two-pass EBU
# R128) is not perfectly accurate but is consistent with the existing SFX
# pass and good enough at this scale.
LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11"
# 15ms in/out fades (longer than SFX's 5ms -- these are full mixes, not
# transients) prevent a sample-boundary click without being audible as a
# fade-in/out on a 2-minute track. Applied to both loops and stingers; Lyria
# has no loop-point control, so its generated clips are not authored with a
# verified zero-crossing loop point -- a short fade is the honest choice over
# claiming a "verified seamless loop" that was never actually measured.
FADE_MS = 15
# 64kbps stereo: at ~2min per loop track (x7) and ~12s per stinger (x2), this
# keeps new music at ~6.6MB, leaving room under the 10MB total-shipped-audio
# ceiling alongside the ~1.2MB already shipped for SFX. 128kbps would put the
# set at ~13MB, over budget; mono was rejected because the pipeline plan
# explicitly calls for stereo music/stingers.
BITRATE = "64k"


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


def dc_offset(path):
    """Informational dc_offset_check step: report the source's DC offset so a
    future raw source that actually needs correction doesn't slip through
    silently. Lyria's generated mixes measured ~0.0001-0.0002 (negligible) on
    every track sampled here, so no corrective filter is applied by default."""
    out = subprocess.run(
        ["ffmpeg", "-i", str(path), "-af", "astats=metadata=1:reset=1", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    for line in out.stderr.splitlines():
        if "DC offset" in line:
            return float(line.strip().split(":")[-1])
    return None


def loop_seam_delta_db(path):
    """Informational loop_verify step: RMS level delta (dB) between the first
    and last 100ms. NOT a real perceptual seam check (no phase/zero-crossing
    analysis) -- just a cheap signal that the two ends aren't wildly
    mismatched in level. A human listen-through is still required for a real
    seamless-loop claim; the ledger's qa_status stays 'unreviewed' regardless."""
    info = ffprobe_info(path)
    dur = info["duration_s"]

    def rms(af):
        out = subprocess.run(
            ["ffmpeg", "-i", str(path), "-af", af, "-f", "null", "-"],
            capture_output=True, text=True,
        )
        for line in out.stderr.splitlines():
            if "RMS level" in line:
                try:
                    return float(line.strip().split(":")[-1].replace("dB", "").strip())
                except ValueError:
                    return None
        return None

    start_rms = rms("atrim=0:0.1,astats=metadata=1:reset=1")
    end_rms = rms(f"atrim={max(dur - 0.1, 0)}:{dur},astats=metadata=1:reset=1")
    if start_rms is None or end_rms is None:
        return None
    return round(abs(start_rms - end_rms), 1)


def process_one(raw_path, out_path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fade_s = FADE_MS / 1000
    filters = [
        f"afade=t=in:st=0:d={fade_s}",
        f"areverse,afade=t=in:st=0:d={fade_s},areverse",
        LOUDNORM,
    ]
    filter_chain = ",".join(filters)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(raw_path), "-af", filter_chain,
         "-c:a", "libmp3lame", "-b:a", BITRATE, "-ar", "44100", "-ac", "2", str(out_path)],
        capture_output=True, text=True, check=True,
    )
    return ffprobe_info(out_path)


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    only_id = sys.argv[1] if len(sys.argv) > 1 else None
    results = []
    for asset in manifest["assets"]:
        if asset.get("category") != "music":
            continue
        prov = asset.get("provenance", {})
        if prov.get("status") != "sourced":
            continue
        if only_id and asset["id"] != only_id:
            continue
        raw = ROOT / prov["raw_path"]
        if not raw.exists():
            print(f"SKIP {asset['id']}: raw file missing at {raw}")
            continue
        out = OUT_DIR / f"{asset['id']}.mp3"
        dco = dc_offset(raw)
        try:
            info = process_one(raw, out)
        except subprocess.CalledProcessError as e:
            print(f"FAIL {asset['id']}: {e.stderr[-500:]}")
            continue
        seam = loop_seam_delta_db(out)
        size_kb = round(out.stat().st_size / 1024, 1)
        print(f"OK   {asset['id']:16s} {info['duration_s']:7.2f}s  {info['channels']}ch  {size_kb:8.1f}KB  "
              f"dc={dco}  seam_delta_db={seam}  -> {out.relative_to(ROOT)}")
        results.append({"id": asset["id"], **info, "size_bytes": out.stat().st_size,
                         "dc_offset": dco, "loop_seam_delta_db": seam})
    total_kb = sum(r["size_bytes"] for r in results) / 1024
    print(f"\n{len(results)} processed, total {total_kb:.1f}KB")
    return results


if __name__ == "__main__":
    main()
