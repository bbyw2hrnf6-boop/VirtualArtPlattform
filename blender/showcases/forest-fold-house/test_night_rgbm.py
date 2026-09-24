import unittest
import numpy as np
from night_rgbm import encode, decode, resize_linear, srgb_to_linear, linear_to_srgb, pixel_hash


class NightRgbmTests(unittest.TestCase):
    def test_dark_neutral_transport_stays_neutral_and_preserves_hdr_range(self):
        levels = np.geomspace(.000001, 1, 1000, dtype=np.float32)
        source = np.repeat(levels[:, None, None], 3, axis=2)
        encoded = encode(source); result = decode(encoded)
        self.assertTrue(np.array_equal(result[:, :, 0], result[:, :, 1]))
        self.assertTrue(np.array_equal(result[:, :, 1], result[:, :, 2]))
        self.assertLess(float(np.abs(result-source).max()), .0046)
        self.assertGreaterEqual(int(encoded[:, :, 3].min()), 1)

    def test_rgbm_reduces_dark_quantization_without_global_range_clipping(self):
        values = np.linspace(0, .003, 1000, dtype=np.float32)
        source = np.stack([values, values*.7, values*.4], axis=1)[None, :, :]
        direct = srgb_to_linear(np.rint(linear_to_srgb(source)*255)/255)
        result = decode(encode(source))
        self.assertLess(float(np.abs(result-source).mean()), float(np.abs(direct-source).mean())/10)
        bright = np.array([[[1, .5, .1]]], dtype=np.float32)
        self.assertEqual(int(encode(bright)[0, 0, 3]), 255)

    def test_mobile_downsampling_conserves_linear_energy_before_encoding(self):
        source = np.zeros((4, 4, 3), dtype=np.float32); source[::2, ::2] = 1
        resized = resize_linear(source, 2)
        np.testing.assert_allclose(resized, .25)
        self.assertEqual(len(pixel_hash(encode(resized))), 64)
        with self.assertRaises(AssertionError): resize_linear(source, 3)

    def test_nonfinite_negative_or_out_of_range_radiance_is_rejected(self):
        for value in [float('nan'), -.1, 1.1]:
            with self.assertRaises(AssertionError): encode(np.full((1, 1, 3), value, dtype=np.float32))


if __name__ == '__main__': unittest.main()
