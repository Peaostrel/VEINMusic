#!/usr/bin/env python3
"""Build reproducible Chromium/Firefox packages from the same audited sources."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'music-extension'
FILES = ['background.js', 'content.js', 'page_world.js', 'pairing.js', 'popup.html', 'popup.js', 'sync-key.js']


def build(output: Path, development: bool = False) -> str:
    manifest = json.loads((SOURCE / 'manifest.json').read_text())
    version = manifest['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Extension version must have three numeric components')
    output.mkdir(parents=True, exist_ok=True)
    assets = FILES + sorted(str(p.relative_to(SOURCE)) for p in (SOURCE / 'icons').glob('*.png'))
    hashes = []
    for browser in ['chromium', 'firefox']:
        package_manifest = json.loads(json.dumps(manifest))
        if browser == 'chromium':
            package_manifest.pop('browser_specific_settings')
            package_manifest['background'] = {'service_worker': 'background.js'}
        else:
            package_manifest.pop('minimum_chrome_version', None)
            package_manifest['background'] = {'scripts': ['pairing.js', 'background.js']}
        if not development:
            package_manifest['host_permissions'] = [x for x in manifest['host_permissions'] if 'localhost' not in x and '127.0.0.1' not in x]
            for script in package_manifest['content_scripts']:
                script['matches'] = [x for x in script['matches'] if 'localhost' not in x and '127.0.0.1' not in x]
        directory = output / browser
        directory.mkdir(exist_ok=True)
        (directory / 'manifest.json').write_text(json.dumps(package_manifest, ensure_ascii=False, indent=2) + '\n')
        for name in assets:
            target = directory / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((SOURCE / name).read_bytes())
        archive = output / f'VEINMusic-extension-{browser}-{version}.zip'
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for name in ['manifest.json'] + assets:
                info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                z.writestr(info, (directory / name).read_bytes())
        with zipfile.ZipFile(archive) as z:
            assert z.testzip() is None
            assert 'manifest.json' in z.namelist()
            assert not any('tests/' in p or p.endswith('.env') for p in z.namelist())
        hashes.append(f'{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}')
    (output / 'SHA256SUMS.txt').write_text('\n'.join(hashes) + '\n')
    print(f'Built VEINMusic extension {version}: {output}')
    return version


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist/extension')
    parser.add_argument('--development', action='store_true', help='Retain loopback hosts for local browser tests')
    args = parser.parse_args()
    build(args.output.resolve(), args.development)
