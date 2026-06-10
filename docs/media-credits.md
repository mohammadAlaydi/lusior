# Media credits & licenses (placeholder assets)

All media are stand-ins downloaded 2026-06-10 so the site runs "alive" in
development. Replace them with original productions before any public release,
or keep + credit as below.

## Videos

| File | Source | Content | License |
|---|---|---|---|
| public/reel/desktop.mp4 | media.w3.org/2010/05/sintel/trailer.mp4 | Sintel trailer (Blender Foundation) | CC-BY 3.0 — credit required |
| public/featured/p1.mp4 | media.w3.org/2010/05/bunny/trailer.mp4 | Big Buck Bunny trailer (Blender Foundation) | CC-BY 3.0 |
| public/featured/p2.mp4 | media.w3.org/2010/05/video/movie_300.mp4 | W3C sample clip | W3C test media |
| public/featured/p3.mp4 | copy of reel/desktop.mp4 | (source URL 404'd) | CC-BY 3.0 |
| public/featured/p4.mp4 | copy of p2.mp4 | (source URL 404'd) | W3C test media |
| public/featured/p5.mp4 | test-videos.co.uk BBB 720p 10s | Big Buck Bunny excerpt | CC-BY 3.0 |
| public/featured/p6.mp4 | test-videos.co.uk BBB 1080p 10s | Big Buck Bunny excerpt | CC-BY 3.0 |

Blender Foundation attribution: © Blender Foundation | sintel.org /
bigbuckbunny.org.

## Images

All from Lorem Picsum (https://picsum.photos, Unsplash-sourced, free to use):
public/goal/in.jpg, public/goal/out.jpg, public/featured/p1–p6.jpg
(deterministic seed URLs — re-fetch with the same seed for the same image).

## Swapping media

Drop a replacement file with the same name — everything is wired by path:
- Reel + fullscreen overlay: `public/reel/desktop.mp4`
- Featured tile N: `public/featured/pN.jpg` (poster) + `pN.mp4` (hover-play)
- Goal frames: `public/goal/in.jpg`, `public/goal/out.jpg`
- Future scroll-scrubbed tunnel video (optional): `public/tunnel/`
