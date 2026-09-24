"""Fast mutation tests for UV provenance, stale caches and complete night assets."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from night_contract import (EXPECTED_GROUPS, PROFILE, digest, resolution,
                            day_geometry_digest, validate_group_set, validate_layout, validate_report, valid_cached_group, validate_manifest)


class NightContractTests(unittest.TestCase):
    def layout(self):
        return {'topologySha256': 'a'*64, 'transform': [1.0]*16,
                'loopCount': 12, 'uvCount': 12, 'uvSha256': 'b'*64}

    def report(self):
        return {'revision': 1, 'sourceSha256': 'source', 'runtimeSha256': 'c'*64, 'dayGeometrySha256': 'f'*64,
                'layoutsSha256': digest({name: self.layout() for name in EXPECTED_GROUPS}),
                'lightingProfileSha256': digest(PROFILE), 'profile': copy.deepcopy(PROFILE),
                'postprocess': {'encoding': 'rgbm-srgb-lossless-webp', 'retainedBitDepth': 16, 'ditherIntensity': 0},
                'groups': {name: {**self.layout(), 'resolution': resolution(name),
                                  'samples': 256, 'irradianceScale': 4, 'denoised': True,
                                  'retainedBitDepth': 16, 'ditherIntensity': 0,
                                  'rgbm': {tier: {'rgbaSha256': 'a'*64} for tier in ['desktop', 'mobile']},
                                  'rawSha256': 'd'*64, 'imageSha256': 'e'*64}
                           for name in EXPECTED_GROUPS}}

    def test_all_twenty_groups_and_retained_layout_are_accepted(self):
        self.assertEqual(len(EXPECTED_GROUPS), 20)
        validate_group_set(EXPECTED_GROUPS)
        validate_layout('W0', self.layout(), self.layout())
        validate_report(self.report(), 'source')

    def test_missing_or_unexpected_group_cannot_ship(self):
        for names in [EXPECTED_GROUPS-{'W0'}, EXPECTED_GROUPS|{'invented'}]:
            with self.assertRaises(AssertionError): validate_group_set(names)

    def test_changed_topology_winding_or_material_indices_fail_hash(self):
        changed = self.layout(); changed['topologySha256'] = 'f'*64
        with self.assertRaisesRegex(AssertionError, 'topology'): validate_layout('W0', changed, self.layout())

    def test_changed_transform_fails(self):
        changed = self.layout(); changed['transform'][0] += .01
        with self.assertRaisesRegex(AssertionError, 'transform'): validate_layout('W0', changed, self.layout())

    def test_missing_or_incomplete_uv_chart_fails(self):
        for key, value in [('uvCount', 0), ('uvSha256', ''), ('loopCount', 11)]:
            changed = self.layout(); changed[key] = value
            with self.subTest(key=key), self.assertRaises(AssertionError): validate_layout('W0', self.layout(), changed)

    def test_report_layout_digest_binds_all_group_uvs_and_topology(self):
        report = self.report(); report['groups']['W0']['uvSha256'] = '1'*64
        with self.assertRaisesRegex(AssertionError, 'layout evidence'): validate_report(report, 'source')

    def test_stale_source_profile_and_unfinished_bake_fail(self):
        for key, value in [('sourceSha256', 'old'), ('lightingProfileSha256', 'old'), ('revision', 0)]:
            report = self.report(); report[key] = value
            with self.subTest(key=key), self.assertRaises(AssertionError): validate_report(report, 'source')
        report = self.report(); report['profile']['sunEnergy'] = 3
        with self.assertRaises(AssertionError): validate_report(report, 'source')
        report = self.report(); report['groups']['W0']['denoised'] = False
        with self.assertRaises(AssertionError): validate_report(report, 'source')

    def test_resolution_samples_normalization_and_image_evidence_are_required(self):
        for key, value in [('resolution', 1024), ('samples', 64), ('irradianceScale', 3), ('imageSha256', '')]:
            report = self.report(); report['groups']['W0'][key] = value
            with self.subTest(key=key), self.assertRaises(AssertionError): validate_report(report, 'source')

    def test_partial_corrupt_or_different_uv_cache_is_not_reused(self):
        entry = {**self.layout(), 'samples': 256, 'irradianceScale': 4, 'rawSha256': 'raw'}
        self.assertTrue(valid_cached_group(entry, self.layout(), 'raw'))
        for key, value in [('uvSha256', 'old'), ('topologySha256', 'old'), ('samples', 64), ('rawSha256', 'corrupt')]:
            changed = {**entry, key: value}
            self.assertFalse(valid_cached_group(changed, self.layout(), 'raw'))
        self.assertFalse(valid_cached_group({}, self.layout(), 'raw'))
        self.assertFalse(valid_cached_group(entry, self.layout(), None))

    def manifest(self):
        report = self.report()
        manifest = {key: report[key] for key in ['revision', 'sourceSha256', 'lightingProfileSha256']}
        manifest.update(colorSpace='srgb', textureChannel=1, flipY=False, encoding='rgbm-srgb-lossless-webp', groups={}); assets = {}
        for name, evidence in report['groups'].items():
            group = {key: evidence[key] for key in ['uvSha256', 'irradianceScale']}
            for tier in ['desktop', 'mobile']:
                size = resolution(name) if tier == 'desktop' else 1024
                url = f'/assets/showcases/forest-fold-house/night-v1/{tier}/{name}.webp'
                group[tier] = {'url': url, 'width': size, 'height': size, 'bytes': 100, 'sha256': 'a'*64}
                assets[url] = {key: group[tier][key] for key in ['width', 'height', 'bytes', 'sha256']}
                assets[url]['losslessSourceMatch'] = True
            manifest['groups'][name] = group
        return manifest, assets

    def test_complete_manifest_measures_additional_textures_not_a_second_model(self):
        manifest, assets = self.manifest()
        self.assertEqual(validate_manifest(manifest, self.report(), 'source', assets), {'desktop': 2000, 'mobile': 2000})

    def test_stale_day_geometry_rejects_night_report(self):
        with self.assertRaisesRegex(AssertionError, 'geometry changed'): validate_report(self.report(), 'source', 'new-geometry')

    def test_missing_corrupt_or_wrong_sized_delivery_asset_fails(self):
        for key, wrong in [('sha256', 'corrupt'), ('width', 1024), ('height', 512), ('bytes', 101)]:
            manifest, assets = self.manifest(); url = manifest['groups']['W0']['desktop']['url']
            assets[url][key] = wrong
            with self.subTest(key=key), self.assertRaises(AssertionError): validate_manifest(manifest, self.report(), 'source', assets)
        manifest, assets = self.manifest(); del assets[manifest['groups']['W0']['desktop']['url']]
        with self.assertRaises(AssertionError): validate_manifest(manifest, self.report(), 'source', assets)

    def test_stale_uv_intensity_profile_or_source_manifest_fails(self):
        for key, wrong in [('uvSha256', 'stale'), ('irradianceScale', 8)]:
            manifest, assets = self.manifest(); manifest['groups']['W0'][key] = wrong
            with self.subTest(key=key), self.assertRaises(AssertionError): validate_manifest(manifest, self.report(), 'source', assets)
        for key in ['sourceSha256', 'lightingProfileSha256']:
            manifest, assets = self.manifest(); manifest[key] = 'stale'
            with self.subTest(key=key), self.assertRaises(AssertionError): validate_manifest(manifest, self.report(), 'source', assets)

    def test_missing_group_bad_sampling_and_external_paths_fail(self):
        manifest, assets = self.manifest(); del manifest['groups']['W0']
        with self.assertRaises(AssertionError): validate_manifest(manifest, self.report(), 'source', assets)
        manifest, assets = self.manifest(); manifest['flipY'] = True
        with self.assertRaises(AssertionError): validate_manifest(manifest, self.report(), 'source', assets)
        manifest, assets = self.manifest(); manifest['groups']['W0']['desktop']['url'] = 'https://example.invalid/atlas.jpg'
        with self.assertRaises(AssertionError): validate_manifest(manifest, self.report(), 'source', assets)

    def test_lossy_encoded_pixels_cannot_pass_using_valid_hashes(self):
        manifest, assets = self.manifest()
        assets[manifest['groups']['W0']['desktop']['url']]['losslessSourceMatch'] = False
        with self.assertRaisesRegex(AssertionError, 'Lossy night'): validate_manifest(manifest, self.report(), 'source', assets)
        manifest, assets = self.manifest(); manifest['encoding'] = 'jpeg'
        with self.assertRaisesRegex(AssertionError, 'lossless'): validate_manifest(manifest, self.report(), 'source', assets)

    def test_low_precision_dithered_or_unproven_rgbm_cannot_ship(self):
        manifest, assets = self.manifest()
        for key, value in [('retainedBitDepth', 8), ('ditherIntensity', 1), ('rgbm', {})]:
            report = self.report(); report['groups']['E0'][key] = value
            with self.subTest(key=key), self.assertRaises(AssertionError): validate_manifest(manifest, report, 'source', assets)

    def test_geometry_digest_handles_virtual_meshopt_fallback_and_detects_real_changes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); desktop = root/'desktop-v5'; desktop.mkdir()
            model = desktop/'forest-fold-house-desktop.gltf'
            model.write_text(json.dumps({'buffers': [{'uri': 'geometry.bin'}, {'extensions': {'EXT_meshopt_compression': {'fallback': True}}}]}))
            binary = desktop/'geometry.bin'; binary.write_bytes(b'geometry')
            (root/'forest-fold-house-mobile.glb').write_bytes(b'mobile')
            before = day_geometry_digest(root)
            binary.write_bytes(b'changed geometry')
            self.assertNotEqual(day_geometry_digest(root), before)
            for buffer in [{}, {'uri': '../outside.bin'}, {'uri': 'https://example.invalid/geometry.bin'}]:
                model.write_text(json.dumps({'buffers': [buffer]}))
                with self.subTest(buffer=buffer), self.assertRaises(AssertionError): day_geometry_digest(root)


if __name__ == '__main__': unittest.main()
