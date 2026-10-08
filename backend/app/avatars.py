"""Photos de profil : validation et réencodage systématique (aucun fichier envoyé n'est servi tel quel)."""

import io
import os
import re
import secrets

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import settings

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
SIZE = 512
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
# Protection contre les images « bombes » (dimensions énormes une fois décompressées)
Image.MAX_IMAGE_PIXELS = 40_000_000

FILENAME_RE = re.compile(r"^\d+-[0-9a-f]{16}\.webp$")


class AvatarError(ValueError):
    pass


def avatars_dir() -> str:
    return os.path.join(settings.uploads_dir, "avatars")


def process_avatar(data: bytes) -> bytes:
    """Image envoyée -> carré 512×512 WebP, orientation corrigée, métadonnées supprimées."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise AvatarError("Image trop lourde (5 Mo maximum).")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            if probe.format not in ALLOWED_FORMATS:
                raise AvatarError("Format non accepté : utilisez une image JPEG, PNG ou WebP.")
            probe.verify()
        image = Image.open(io.BytesIO(data))
        image.load()
    except AvatarError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError) as exc:
        raise AvatarError("Ce fichier n'est pas une image valide.") from exc

    image = ImageOps.exif_transpose(image)
    image = image.convert("RGBA" if image.mode in ("RGBA", "LA", "P") else "RGB")
    image = ImageOps.fit(image, (SIZE, SIZE), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    image.save(out, "WEBP", quality=85, method=4)  # sans EXIF ni autres métadonnées
    return out.getvalue()


def store_avatar(account_id: int, data: bytes) -> str:
    os.makedirs(avatars_dir(), exist_ok=True)
    filename = f"{account_id}-{secrets.token_hex(8)}.webp"
    with open(os.path.join(avatars_dir(), filename), "wb") as f:
        f.write(data)
    return filename


def delete_avatar(filename: str | None) -> None:
    if filename and FILENAME_RE.match(filename):
        try:
            os.remove(os.path.join(avatars_dir(), filename))
        except FileNotFoundError:
            pass


def avatar_url(filename: str | None) -> str | None:
    return f"/api/media/avatars/{filename}" if filename else None
