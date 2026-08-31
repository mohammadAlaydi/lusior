# Media provenance

The production showcase no longer ships third-party sample films, stock art, or
Picsum stand-ins. Every featured still and video comes only from the corresponding
product: a public product surface, an authorized staging account, a deterministic
seeded demo, an official first-party app-store listing, or the native application
running in an Android emulator. No production account or customer-identifying data
was used. Confirm client/publication permission for each case study before an
external launch.

| Output                       | Source material                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `public/reel/desktop.mp4`    | Silent montage assembled only from the seven product captures and first-party listing edits under `public/media/`            |
| `public/goal/in.jpg`         | Recrop of the authenticated Envaglo staging ERP capture                                                                      |
| `public/goal/out.jpg`        | Recrop of the Reevez public seeded-dashboard capture                                                                         |
| `public/og/reevez.jpg`       | 1200×630 social crop of the Reevez public seeded-dashboard capture                                                           |
| `public/media/magic-stamp/`  | Live `magicstamp.com`, the Stampi Android launch/login surface, and first-party Magic Stamp Google Play listing screenshots  |
| `public/media/rahmet-ihsan/` | Live Arabic home and projects-page captures from `rahmetihsan.com`                                                           |
| `public/media/envaglo/`      | Authorized staging ERP home/accounting/inventory captures plus the working VIP storefront at `stage.envaglo.com/s/vipco/ar`  |
| `public/media/mawared/`      | Native Mawared Android onboarding captured in the emulator                                                                   |
| `public/media/mywill/`       | Native Android emulator capture plus first-party screenshots from the published MyWill Google Play listing                   |
| `public/media/paligram/`     | First-party Play screenshots plus a privacy-safe native emulator crop; the loop edits official stills, not simulated screens |
| `public/media/reevez/`       | Public `/dashboard-demo` overview, revenue, cash-flow, and sales-pipeline captures with seeded data                          |

All published loops and the reel are H.264/yuv420p with fast-start metadata and
no audio track. Keep future replacements under the same
`public/media/<slug>/` ownership boundary; do not reintroduce generic sample
footage into the public build.

Official listing sources: [MyWill on Google Play](https://play.google.com/store/apps/details?id=com.bashsquare.my_will),
[MyWill on the App Store](https://apps.apple.com/us/app/mywill-digital-legacy/id6771635405),
[Paligram on Google Play](https://play.google.com/store/apps/details?id=com.messaging.enigma),
and [Paligram on the App Store](https://apps.apple.com/us/app/paligram/id6702027385).
Neither current listing includes an official trailer, so the website does not
mislabel either listing montage as a store-provided video.
