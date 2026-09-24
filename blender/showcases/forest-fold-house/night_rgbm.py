"""High-precision night transport in one existing sRGB RGBA8 allocation.

RGB stores sRGB-encoded normalized irradiance / M; alpha stores linear M.
Decode texture RGB to linear, multiply alpha, then the existing group scale.
Never premultiply alpha or resize this encoded representation.
"""
import hashlib
import numpy as np

ENCODING = 'rgbm-srgb-lossless-webp'


def linear_to_srgb(rgb):
    return np.where(rgb <= .0031308, rgb*12.92, 1.055*np.maximum(rgb, 0)**(1/2.4)-.055)


def srgb_to_linear(rgb):
    return np.where(rgb <= .04045, rgb/12.92, ((rgb+.055)/1.055)**2.4)


def resize_linear(rgb, size):
    assert rgb.ndim == 3 and rgb.shape[2] == 3
    height, width, _ = rgb.shape
    assert width % size == 0 and height % size == 0, 'Expected integer irradiance downsample'
    # Area filtering conserves average incident energy, without ringing or
    # filtering RGBM's nonlinear multiplier into neighbouring texels.
    return rgb.reshape(size, height//size, size, width//size, 3).mean(axis=(1, 3))


def encode(rgb):
    assert np.isfinite(rgb).all() and rgb.min() >= 0 and rgb.max() <= 1, 'Invalid normalized irradiance'
    multiplier = np.maximum(1, np.ceil(rgb.max(axis=2)*255)).astype(np.uint8)
    color = np.rint(np.clip(linear_to_srgb(rgb/(multiplier[:, :, None].astype(np.float32)/255)), 0, 1)*255).astype(np.uint8)
    return np.concatenate([color, multiplier[:, :, None]], axis=2)


def decode(rgba):
    return srgb_to_linear(rgba[:, :, :3].astype(np.float32)/255)*(rgba[:, :, 3:4].astype(np.float32)/255)


def pixel_hash(rgba):
    assert rgba.dtype == np.uint8 and rgba.ndim == 3 and rgba.shape[2] == 4
    return hashlib.sha256(rgba.tobytes()).hexdigest()
