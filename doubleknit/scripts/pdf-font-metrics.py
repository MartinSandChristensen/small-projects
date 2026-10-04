from fontTools.ttLib import TTFont
from pathlib import Path
import json
font=TTFont('assets/NotoSans-Regular.ttf')
chars=set(chr(n) for n in range(32,384))
for path in Path('src').glob('*.js'): chars.update(path.read_text())
cmap=font.getBestCmap()
metrics={str(ord(c)):font['hmtx'][cmap[ord(c)]][0] for c in sorted(chars) if ord(c) in cmap}
Path('src/pdf-font-metrics.js').write_text('// Advance widths from assets/NotoSans-Regular.ttf; regenerate with scripts/pdf-font-metrics.py.\nexport const fontUnits = '+str(font['head'].unitsPerEm)+';\nexport const fontWidths = '+json.dumps(metrics,separators=(',',':'))+';\n')
