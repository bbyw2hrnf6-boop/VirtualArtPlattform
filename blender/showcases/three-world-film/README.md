# LIEUVA — Three worlds homepage film

An original 20-second motion montage, authored for LIEUVA from its actual retained Cycles renders. It presents **Art spaces (0–7 seconds)**, **Sculpture Pavilion (7–13)** and **Forest Fold House (13–20)**. The closing LIEUVA wordmark is part of the house chapter. There is no narration.

The camera movement consists of animated image crops and an edited sequence of viewpoints. This is not a recording of a continuous 3D camera path or the real-time browser renderer. The opening art chapter includes actual White Cube and Grand Forum Studio beauty renders, followed by two opposing Obsidian viewpoints. No supplied concept images, new artworks or stock footage appear. The existing 18-second presentation intro remains separate.

## Exact opening sequence

- 0–1.9 s: White Cube — bright lateral composition.
- 1.9–3.7 s: Grand Forum — symmetrical skylit hall.
- 3.7–5.4 s: Obsidian, R1-SW.
- 5.4–7 s: Obsidian, R1-NE — reverse view with an outward drift.

The sculpture chapter uses the atrium, glass sculpture and kinetic sculpture viewpoints. The house chapter moves from the exterior through the bridge to the dining room, then closes on LIEUVA. This edit has fewer shots and a new soundtrack. The clean poster shows White Cube at 1.0 seconds, with no film typography.

Three brief English teasers are baked into both encodes: “Art, in a new light.” (1.0–3.2 s), “Beyond the frame.” (9.2–11.4 s), and “Step inside.” (14.0–16.2 s). They use softly faded, 80 px serif text at the lower left.

## Retained source and provenance

`manifest.json` records every source render, dimensions, SHA-256, shot timing and crop movement. Original Studio and showcase provenance continues to apply; no standalone asset reuse licence is introduced.

`masters/obsidian-R1-NE.png` is the additional reverse view used in the current edit. Earlier `masters/obsidian-R2-SW.png` and `masters/obsidian-R3-SW.png` are retained from the preceding edit. These are 2560 × 1440, 128-sample Cycles stills rendered directly from the retained `../obsidian/obsidian.blend`. `render_obsidian.py` only selects its existing cameras and delivery settings; it does not save or alter the source scene. White Cube and Grand Forum use `blender/production/v3/white-cube-r5-3840.png` and `pavilion-r5-3840.png`; the master filenames retain their original compatibility identifiers. Other shots use existing showcase beauty masters and sculpture portraits.

The stereo soundtrack is an original deterministic synthesis in A major: warm struck tones, a quiet airy chord pad and light wooden ticks, with a smooth resolution. It contains no voice, samples, external music or recordings. The original waveform is reproducible with `make_frames.py`; generated audio and frames remain in ignored `artifacts/lieuva-homepage-film/20s/`. Arial and Baskerville are rasterized from system fonts into the wordmark and teasers; no font binary is distributed.

## Public delivery

- `/assets/films/lieuva-three-worlds-20s.mp4`: 1920 × 1080, 30 fps, H.264/AAC, target video rate 2.85 Mbps.
- `/assets/films/lieuva-three-worlds-20s-720.mp4`: 1280 × 720, 30 fps, H.264/AAC, target video rate 1.35 Mbps.
- `/assets/films/lieuva-three-worlds-poster.webp`: 1920 × 1080 first-chapter poster.

Both video variants are exactly 20 seconds and optimized for progressive playback. `delivery-report.json` records measured duration, dimensions, frame rate and byte size. Superseded 42-second encodes and their source metadata are archived under ignored `artifacts/lieuva-homepage-film/previous-42s/`. Player consent, audio controls, reduced motion, lazy loading and chapter links belong to the homepage component.

## Reproduce

Run from the repository root. Dependencies are Blender 5.2, a Python environment containing Pillow/NumPy, and macOS Swift/AVFoundation. Native encoding needs access to macOS media services.

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b blender/showcases/obsidian/obsidian.blend --python-exit-code 1 --python blender/showcases/three-world-film/render_obsidian.py
python3 blender/showcases/three-world-film/make_frames.py
swift -sdk /Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk -module-cache-path artifacts/lieuva-homepage-film/swift-cache blender/showcases/three-world-film/encode.swift
python3 blender/showcases/three-world-film/report_delivery.py
```

Use the matching installed Swift SDK if its version differs. The retained masters allow the first command to be skipped when rebuilding only the edit or encodes. The Python script writes exactly 600 temporary 1080p JPEG frames to the dedicated `20s/frames/` directory; these are build intermediates, never public deployment input.
