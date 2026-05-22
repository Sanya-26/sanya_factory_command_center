#!/usr/bin/env python3
import sys
import os

# Try multiple methods to convert HTML to PDF
html_file = r"c:\Users\sanya\Test\aubos_factory_ui\docs\ROUND-7-FINAL-REPORT.html"
pdf_file = r"c:\Users\sanya\OneDrive\Desktop\AUBOS-FACTORY-ROUND-7-REPORT.pdf"

# Method 1: Try weasyprint
try:
    from weasyprint import HTML
    HTML(html_file).write_pdf(pdf_file)
    print(f"✓ PDF created with weasyprint: {pdf_file}")
    sys.exit(0)
except ImportError:
    pass
except Exception as e:
    print(f"weasyprint failed: {e}")

# Method 2: Try pdfkit
try:
    import pdfkit
    options = {'page-size': 'Letter', 'margin-top': '0.75in', 'margin-right': '0.75in'}
    pdfkit.from_file(html_file, pdf_file, options=options)
    print(f"✓ PDF created with pdfkit: {pdf_file}")
    sys.exit(0)
except ImportError:
    pass
except Exception as e:
    print(f"pdfkit failed: {e}")

# If both fail, provide instructions
print("⚠ HTML-to-PDF libraries not installed.")
print("\nTo create the PDF manually:")
print(f"1. Open: file:///{html_file}")
print("2. Press Ctrl+P (or Cmd+P on Mac)")
print("3. Select 'Save as PDF'")
print(f"4. Save to: {pdf_file}")
