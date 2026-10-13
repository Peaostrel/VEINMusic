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
MANIFEST = 'manifest.json'
BACKGROUND = 'background.js'
FILES = [BACKGROUND, 'content.js', 'page_world.js', 'pairing.js', 'popup.html', 'popup.js', 'sync-key.js']


def browser_manifest(manifest: dict, browser: str, development: bool) -> dict:
    result = json.loads(json.dumps(manifest))
    if browser == 'chromium':
        result.pop('browser_specific_settings')
        result['background'] = {'service_worker': BACKGROUND}
    else:
        result.pop('minimum_chrome_version', None)
        result['background'] = {'scripts': ['pairing.js', BACKGROUND]}
    if not development:
        result['host_permissions'] = production_hosts(result['host_permissions'])
        for script in result['content_scripts']:
            script['matches'] = production_hosts(script['matches'])
    return result


def production_hosts(hosts: list[str]) -> list[str]:
    return [x for x in hosts if 'localhost' not in x and '127.0.0.1' not in x]


def write_archive(archive: Path, directory: Path, assets: list[str]) -> None:
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name in [MANIFEST] + assets:
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, (directory / name).read_bytes())
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert MANIFEST in z.namelist()
        assert not any('tests/' in p or p.endswith('.env') for p in z.namelist())


def build(output: Path, development: bool = False) -> str:
    manifest = json.loads((SOURCE / MANIFEST).read_text())
    version = manifest['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Extension version must have three numeric components')
    output.mkdir(parents=True, exist_ok=True)
    assets = FILES + sorted(str(p.relative_to(SOURCE)) for p in (SOURCE / 'icons').glob('*.png'))
    hashes = []
    for browser in ['chromium', 'firefox']:
        directory = output / browser
        directory.mkdir(exist_ok=True)
        package_manifest = browser_manifest(manifest, browser, development)
        (directory / MANIFEST).write_text(json.dumps(package_manifest, ensure_ascii=False, indent=2) + '\n')
        for name in assets:
            target = directory / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((SOURCE / name).read_bytes())
        archive = output / f'VEINMusic-extension-{browser}-{version}.zip'
        write_archive(archive, directory, assets)
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
