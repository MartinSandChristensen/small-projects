# PDF font

`NotoSans-Regular.ttf` is an unmodified static font from
[Noto Fonts](https://github.com/notofonts/noto-fonts/tree/ffebf8c1ee449e544955a7e813c54f9b73848eac),
path `hinted/ttf/NotoSans/NotoSans-Regular.ttf`, bundled at that immutable revision.
Its SHA-256 is `b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5`.

The font is licensed under the [SIL Open Font License 1.1](OFL-NotoSans.txt).
It is embedded and subset by jsPDF for deterministic English/Danish PDF text, including æ/ø/å.
It also covers many other scripts, but is not a universal Unicode/emoji font. Export reports unsupported
project-name glyphs rather than silently changing a name. The application uses browser fonts on screen.

The PDF generator itself is the [MIT-licensed jsPDF](https://github.com/parallax/jsPDF/blob/v4.2.1/LICENSE),
loaded on demand from `https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js`.
