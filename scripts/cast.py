"""The players' own voices, spoken by Kokoro-82M (Apache-2.0) and encoded into one sprite: the taunts
a player says when he frags. His cry as he goes down is the synth's (sfx.ts, scream()), not his
voice (the user, 2026-11-17). The ninja's are in Japanese, in voices of
their own after the others.

Writes src/client/voice/cast.ts (the speakers, the kinds of line and where each clip lies in the
sprite), cast-opus.ts and cast-mp3.ts (the sprite as base64: Ogg Opus first, MP3 for the browsers
that cannot decode it).

Needs what scripts/voice.py needs (kokoro-onnx, soundfile, numpy, espeak-ng, opus-tools, lame and
the two model files):

    python scripts/cast.py path/to/model/dir
"""
import base64, os, subprocess, sys, tempfile
import numpy as np
import soundfile as sf
from kokoro_onnx import EspeakConfig, Kokoro

# Two voices for the man, then two for the woman; none is the announcer's (af_heart).
SPEAKERS = [("am_fenrir", 1.0), ("am_michael", 1.05), ("af_bella", 1.0), ("bf_emma", 1.05)]
# The ninja's: Kokoro's one Japanese man, then a Japanese woman.
NINJAS = [("jm_kumo", 1.0), ("jf_alpha", 1.0)]
# Each kind's lines, in the order the client indexes them (KIND in cast.ts).
KINDS = [
    (
        "TAUNT",
        [
            "Too slow.",
            "Stay down.",
            "Back to the spawn with you.",
            "Is that all you've got?",
            "Nice try.",
            "Get off my roof.",
            "Who wants some more?",
            "Sit down.",
            "Lights out.",
            "You run like a tourist.",
        ],
    ),
    # A frag with the bare fists: the worst of it.
    ("FISTS", ["With my bare hands!", "Slapped silly."]),
    # A frag with the katana.
    ("BLADE", ["Clean cut.", "Cut down to size."]),
]
# The ninja's lines, as many of each kind, in kana as they sound (は said "wa" written わ), each
# with its romaji and its meaning for cast.ts.
NINJA_KINDS = [
    (
        "TAUNT",
        [
            ("おそい！", "Osoi! (Too slow!)"),
            ("よわい！", "Yowai! (Weak!)"),
            ("ばかめ！", "Baka me! (You fool!)"),
            ("しゅぎょうが たりん。", "Shugyō ga tarin. (Not enough training.)"),
            ("さるも きから おちる。", "Saru mo ki kara ochiru. (Even monkeys fall from trees.)"),
            ("ななころび やおき。", "Nana korobi ya oki. (Fall seven times, stand up eight.)"),
            ("でなおして こい！", "Denaoshite koi! (Come back when you are ready!)"),
            ("ざこめ！", "Zako me! (Small fry!)"),
            ("じゅうねん はやい！", "Jūnen hayai! (Ten years too early!)"),
            ("いのなかの かわず。", "I no naka no kawazu. (A frog in a well.)"),
        ],
    ),
    (
        "FISTS",
        [
            ("すでで じゅうぶんだ。", "Sude de jūbun da. (Bare hands are enough.)"),
            ("いちげき ひっさつ！", "Ichigeki hissatsu! (One blow, one kill!)"),
        ],
    ),
    (
        "BLADE",
        [
            ("いっとう りょうだん！", "Ittō ryōdan! (Cut in two at one stroke!)"),
            ("きりすて ごめん！", "Kirisute gomen! (Leave to cut you down!)"),
        ],
    ),
]
assert [(k, len(t)) for k, t in NINJA_KINDS] == [(k, len(t)) for k, t in KINDS]

# Kana to Kokoro's Japanese phonemes (misaki's): Kokoro's espeak path drops the vowels it cannot read.
MORA = dict(
    zip(
        "あいうえおかきくけこがぎぐげごさしすせそざじずぜぞたちつてとだぢづでどなにぬねの"
        "はひふへほばびぶべぼぱぴぷぺぽまみむめもやゆよらりるれろわをん",
        "a i ɯ e o ka ki kɯ ke ko ga gi gɯ ge go sa ɕi sɯ se so za ʥi zɯ ze zo ta ʨi ʦɯ te to "
        "da ʥi zɯ de do na ɲi nɯ ne no ha çi ɸɯ he ho ba bi bɯ be bo pa pi pɯ pe po "
        "ma mi mɯ me mo ja jɯ jo ɾa ɾi ɾɯ ɾe ɾo wa o ɴ".split(),
    )
)
# A small ya, yu or yo after an i-row mora: the consonant softened, the i gone.
GLIDE = {"ゃ": "a", "ゅ": "ɯ", "ょ": "o"}
SOFT = {"ɕ": "ɕ", "ʨ": "ʨ", "ʥ": "ʥ", "ɲ": "ɲ", "ç": "ç"}
MARKS = {"！": "!", "。": ".", "、": ",", "？": "?", "…": "…", " ": " "}


def phonemes(kana):
    """Kokoro's phonemes for `kana`: っ a glottal stop, ー and an o or u held long."""
    out = []
    for c in kana:
        if "ァ" <= c <= "ヶ":
            c = chr(ord(c) - 0x60)
        if c in GLIDE:
            stem = out.pop()[:-1]
            out.append((stem if stem in SOFT else stem + "ʲ") + GLIDE[c])
        elif c == "っ":
            out.append("ʔ")
        elif c == "ー" or (c == "う" and out and out[-1][-1] in "oɯ"):
            out.append("ː")
        elif c in MORA:
            out.append(MORA[c])
        else:
            out.append(MARKS[c])
    return "".join(out)

RATE = 24000
GAP = int(RATE * 0.2)
# Clips are padded to whole centiseconds, so that their lengths alone place them in the sprite.
TICK = RATE // 100
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "client", "voice")

models = sys.argv[1] if len(sys.argv) > 1 else "."
brew = subprocess.run(["brew", "--prefix"], capture_output=True, text=True).stdout.strip()
kokoro = Kokoro(
    os.path.join(models, "kokoro-v1.0.onnx"),
    os.path.join(models, "voices-v1.0.bin"),
    espeak_config=EspeakConfig(
        lib_path=f"{brew}/lib/libespeak-ng.dylib", data_path=f"{brew}/share/espeak-ng-data"
    ),
)


def trim(a):
    loud = np.where(np.abs(a) > 0.01 * np.abs(a).max())[0]
    return a[max(loud[0] - RATE // 100, 0) : loud[-1] + RATE // 20]


parts, clips, t = [np.zeros(GAP, np.float32)], [], GAP
said = [(s, KINDS, False) for s in SPEAKERS] + [
    (s, [(k, [phonemes(x) for x, _ in t]) for k, t in NINJA_KINDS], True) for s in NINJAS
]
for (voice, speed), kinds, sounds in said:
    for kind, texts in kinds:
        for text in texts:
            a, sr = kokoro.create(text, voice=voice, speed=speed, lang="en-us", is_phonemes=sounds)
            assert sr == RATE
            a = trim(a)
            a = (a / np.abs(a).max() * 0.9).astype(np.float32)
            a = np.concatenate([a, np.zeros(-len(a) % TICK, np.float32)])
            clips.append((t, len(a)))
            parts += [a, np.zeros(GAP, np.float32)]
            t += len(a) + GAP
sprite = np.concatenate(parts)

with tempfile.TemporaryDirectory() as tmp:
    wav = os.path.join(tmp, "cast.wav")
    sf.write(wav, sprite, RATE)
    encoded = {}
    for ext, cmd in [
        ("opus", ["opusenc", "--quiet", "--speech", "--bitrate", "16", wav]),
        ("mp3", ["lame", "--quiet", "-m", "m", "-b", "32", wav]),
    ]:
        dst = os.path.join(tmp, f"cast.{ext}")
        subprocess.run(cmd + [dst], check=True)
        encoded[ext] = open(dst, "rb").read()

head = "// Generated by scripts/cast.py: do not edit.\n"
for ext, data in encoded.items():
    with open(os.path.join(OUT, f"cast-{ext}.ts"), "w") as f:
        f.write(head + f"/** The players' voices, {ext.upper()} as base64 ({len(data)} B). */\n")
        f.write(f"export default '{base64.b64encode(data).decode()}';\n")
lines = sum(len(texts) for _, texts in KINDS)
with open(os.path.join(OUT, "cast.ts"), "w") as f:
    f.write(head)
    f.write("/** Voices for each body: the man's first, then the woman's. */\n")
    f.write(f"export const VOICES = {len(SPEAKERS) // 2};\n")
    f.write("/** The ninja's voice for each body, in Japanese, after the others: the man's, then the woman's. */\n")
    f.write(f"export const NINJA = {len(SPEAKERS)};\n")
    f.write("/** Clips each voice says, in the order of KIND. */\n")
    f.write(f"export const LINES = {lines};\n")
    f.write("/** The clips of a voice by kind: the first and one past the last. */\n")
    f.write("export const KIND = {\n")
    i = 0
    for kind, texts in KINDS:
        ninja = " ".join(f'"{x}"' for _, x in dict(NINJA_KINDS)[kind])
        f.write("  /** " + " ".join(f'"{x}"' for x in texts) + f" The ninja: {ninja} */\n")
        f.write(f"  {kind}: [{i}, {i + len(texts)}],\n")
        i += len(texts)
    f.write("} as const;\n\n")
    f.write(f"/** Seconds of silence before each clip. */\nconst GAP = {GAP / RATE};\n")
    f.write("/** Each clip's length in centiseconds, two base-36 digits a clip, voice by voice. */\n")
    lengths = "".join(np.base_repr(n // TICK, 36).lower().rjust(2, "0") for _, n in clips)
    f.write(f"const LENGTHS =\n  '{lengths}';\n\n")
    f.write("/** Where each clip lies in the sprite, voice by voice: its start and its length, seconds. */\n")
    f.write("export const CAST: readonly (readonly [number, number])[] = [];\n")
    f.write("for (let i = 0, t = GAP; i < LENGTHS.length; i += 2) {\n")
    f.write("  const n = parseInt(LENGTHS.slice(i, i + 2), 36) / 100;\n")
    f.write("  (CAST as [number, number][]).push([t, n]);\n")
    f.write("  t += n + GAP;\n")
    f.write("}\n")
print({k: len(v) for k, v in encoded.items()}, f"{len(sprite) / RATE:.1f} s")
