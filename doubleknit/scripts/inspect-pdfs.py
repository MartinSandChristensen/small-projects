"""Check fixtures from BROWSER_CHECK=pdf with two independent PDF engines.

Optional tools: PyMuPDF 1.26.7 and pypdfium2 5.3.0.
Run: PYTHONPATH=/tmp/doubleknit-pdf-tools python3 scripts/inspect-pdfs.py
"""
import glob

import fitz
import pypdfium2 as pdfium

paths = glob.glob('/tmp/doubleknit-pdf-*.pdf')
assert paths, 'Run BROWSER_CHECK=pdf first.'
for path in paths:
    with fitz.open(path) as document, pdfium.PdfDocument(path) as other_document:
        assert len(document) == len(other_document)
        for index, page in enumerate(document):
            other_page = other_document[index]
            size = other_page.get_size()
            assert abs(page.rect.width - size[0]) < 0.1 and abs(page.rect.height - size[1]) < 0.1
            text = page.get_text()
            text_page = other_page.get_textpage()
            other_text = text_page.get_text_range()
            text_page.close()
            assert 'Ærø' in text and 'Ærø' in other_text, (path, index)
            assert '\ufffd' not in text and '\ufffd' not in other_text
            if path.endswith('-snapshot.pdf'):
                assert len(document) == 1 and document.metadata['title'] == 'Ærø snapshot'
                assert 'Tegnforklaring' in text and 'Changed' not in text
            for block in page.get_text('dict')['blocks']:
                for line in block.get('lines', []):
                    for span in line['spans']:
                        bounds = fitz.Rect(span['bbox'])
                        # Millimetre margins, with a small font-metric tolerance.
                        assert (bounds.x0 >= 27 and bounds.x1 <= page.rect.width - 27
                                and bounds.y0 >= 27 and bounds.y1 <= page.rect.height - 27), (path, index, span)
            pixels = page.get_pixmap(matrix=fitz.Matrix(1, 1))
            bitmap = other_page.render(scale=1, rev_byteorder=True,
                                       force_bitmap_format=pdfium.raw.FPDFBitmap_BGR)
            assert pixels.width == bitmap.width and pixels.height == bitmap.height
            assert min(bytes(bitmap.buffer)) < 100
            if index < 2:
                pixels.save(path[:-4] + f'-page{index + 1}-mupdf.png')
                raw = bytes(bitmap.buffer)
                samples = b''.join(raw[y * bitmap.stride:y * bitmap.stride + bitmap.width * 3]
                                   for y in range(bitmap.height))
                fitz.Pixmap(fitz.csRGB, bitmap.width, bitmap.height, samples, False).save(
                    path[:-4] + f'-page{index + 1}-pdfium.png')
            bitmap.close()
            other_page.close()
        print(path, len(document), 'PASS both renderers, dimensions, glyphs and text bounds')
