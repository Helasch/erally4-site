import io

import pytest
from PIL import Image

from app.avatars import AvatarError, process_avatar


def make_image(fmt: str, size=(800, 600), mode="RGB", exif=False) -> bytes:
    image = Image.new(mode, size, (200, 30, 40) if mode == "RGB" else (200, 30, 40, 128))
    out = io.BytesIO()
    kwargs = {}
    if exif:
        data = Image.Exif()
        data[0x8825] = {2: (48.0, 51.0, 24.0)}  # GPSInfo
        kwargs["exif"] = data
    image.save(out, fmt, **kwargs)
    return out.getvalue()


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_accepted_formats_become_square_webp(fmt):
    result = Image.open(io.BytesIO(process_avatar(make_image(fmt))))
    assert result.format == "WEBP"
    assert result.size == (512, 512)


def test_metadata_removed():
    result = Image.open(io.BytesIO(process_avatar(make_image("JPEG", exif=True))))
    assert not result.getexif()


def test_transparency_kept():
    result = Image.open(io.BytesIO(process_avatar(make_image("PNG", mode="RGBA"))))
    assert result.mode == "RGBA"


def test_rejects_other_formats_and_garbage():
    with pytest.raises(AvatarError):
        process_avatar(make_image("GIF"))
    with pytest.raises(AvatarError):
        process_avatar(b"<svg onload=alert(1)></svg>")
    with pytest.raises(AvatarError):
        process_avatar(b"\x00" * 100)


def test_rejects_too_large_file():
    with pytest.raises(AvatarError):
        process_avatar(b"\xff" * (5 * 1024 * 1024 + 1))
