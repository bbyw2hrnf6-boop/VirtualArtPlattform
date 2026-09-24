"""Fast release-evidence checks; no Blender or image files are required."""
import unittest

from master_contract import EXPECTED_MASTERS, NATIVE_SIZE, validate_master, validate_master_set


class MasterContractTests(unittest.TestCase):
    def evidence(self, name):
        camera, lighting, samples = EXPECTED_MASTERS[name]
        return {'camera': camera, 'lighting': lighting, 'samples': samples,
                'width': 3840, 'height': 2160, 'sourceSha256': 'current-source'}

    def test_full_release_accepts_hero_and_all_nine_other_masters(self):
        self.assertEqual(len(EXPECTED_MASTERS), 10)
        validate_master_set(EXPECTED_MASTERS)
        for name in EXPECTED_MASTERS:
            with self.subTest(name=name):
                validate_master(name, self.evidence(name), NATIVE_SIZE, 'current-source')

    def test_missing_and_unapproved_camera_cannot_pass_by_glob(self):
        for missing in EXPECTED_MASTERS:
            with self.subTest(missing=missing), self.assertRaises(AssertionError):
                validate_master_set(set(EXPECTED_MASTERS) - {missing})
        with self.assertRaises(AssertionError):
            validate_master_set(set(EXPECTED_MASTERS) | {'C90-afternoon.png'})

    def test_proof_size_cannot_claim_native_resolution(self):
        name = 'C07-afternoon.png'
        with self.assertRaises(AssertionError):
            validate_master(name, self.evidence(name), (1920, 1080), 'current-source')
        evidence = self.evidence(name)
        evidence.update(width=1920, height=1080)
        with self.assertRaises(AssertionError):
            validate_master(name, evidence, NATIVE_SIZE, 'current-source')

    def test_camera_lighting_samples_and_source_are_bound_to_filename(self):
        name = 'C01-afternoon.png'
        for field, wrong in [('camera', 'C07'), ('lighting', 'overcast'),
                             ('samples', 256), ('sourceSha256', 'older-source')]:
            evidence = self.evidence(name)
            evidence[field] = wrong
            with self.subTest(field=field), self.assertRaises(AssertionError):
                validate_master(name, evidence, NATIVE_SIZE, 'current-source')
        evidence = self.evidence('C01-evening.png')
        evidence['samples'] = 96
        with self.assertRaises(AssertionError):
            validate_master('C01-evening.png', evidence, NATIVE_SIZE, 'current-source')


if __name__ == '__main__':
    unittest.main()
