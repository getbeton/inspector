"""
Encryption utilities for securely storing API keys and sensitive data.
Uses Fernet symmetric encryption with a key derived from environment variable.
"""
import os
import base64
import logging
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


class EncryptionError(Exception):
    """Raised when encryption/decryption operations fail."""
    pass


class EncryptionService:
    """
    Service for encrypting and decrypting sensitive data using Fernet.

    Usage:
        # Initialize with encryption key from environment
        encryption = EncryptionService()

        # Or provide key directly
        encryption = EncryptionService(key="your-fernet-key")

        # Encrypt
        encrypted = encryption.encrypt("my-api-key")

        # Decrypt
        decrypted = encryption.decrypt(encrypted)
    """

    ENV_KEY_NAME = "BETON_ENCRYPTION_KEY"

    def __init__(self, key: Optional[str] = None):
        """
        Initialize encryption service.

        Args:
            key: Fernet-compatible encryption key. If not provided,
                 reads from BETON_ENCRYPTION_KEY environment variable.

        Raises:
            EncryptionError: If no key is provided and env var is not set.
        """
        self._key = key or os.environ.get(self.ENV_KEY_NAME)

        if not self._key:
            logger.warning(
                f"No encryption key provided. Set {self.ENV_KEY_NAME} environment variable "
                "or pass key directly. Generating temporary key for development."
            )
            # Generate a temporary key for development
            # This should NEVER be used in production
            self._key = Fernet.generate_key().decode()
            self._is_temporary = True
        else:
            self._is_temporary = False

        try:
            self._fernet = Fernet(self._key.encode() if isinstance(self._key, str) else self._key)
        except Exception as e:
            raise EncryptionError(f"Invalid encryption key format: {e}")

    @property
    def is_temporary_key(self) -> bool:
        """Returns True if using a temporary (non-persistent) key."""
        return self._is_temporary

    def encrypt(self, plaintext: str) -> str:
        """
        Encrypt a string value.

        Args:
            plaintext: The string to encrypt.

        Returns:
            Base64-encoded encrypted string.

        Raises:
            EncryptionError: If encryption fails.
        """
        if not plaintext:
            raise EncryptionError("Cannot encrypt empty string")

        try:
            encrypted_bytes = self._fernet.encrypt(plaintext.encode('utf-8'))
            return encrypted_bytes.decode('utf-8')
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            raise EncryptionError(f"Failed to encrypt data: {e}")

    def decrypt(self, ciphertext: str) -> str:
        """
        Decrypt an encrypted string.

        Args:
            ciphertext: The encrypted string to decrypt.

        Returns:
            The original plaintext string.

        Raises:
            EncryptionError: If decryption fails (wrong key, corrupted data, etc.)
        """
        if not ciphertext:
            raise EncryptionError("Cannot decrypt empty string")

        try:
            decrypted_bytes = self._fernet.decrypt(ciphertext.encode('utf-8'))
            return decrypted_bytes.decode('utf-8')
        except InvalidToken:
            logger.error("Decryption failed: Invalid token (wrong key or corrupted data)")
            raise EncryptionError(
                "Failed to decrypt data. The encryption key may have changed or data is corrupted."
            )
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise EncryptionError(f"Failed to decrypt data: {e}")

    def is_valid_encrypted(self, ciphertext: str) -> bool:
        """
        Check if a string appears to be valid encrypted data.
        Does NOT verify the data can be decrypted - just checks format.

        Args:
            ciphertext: String to check.

        Returns:
            True if the string looks like Fernet-encrypted data.
        """
        if not ciphertext:
            return False

        try:
            # Fernet tokens start with 'gAAAAA' when base64 encoded
            return ciphertext.startswith('gAAAAA')
        except Exception:
            return False

    def can_decrypt(self, ciphertext: str) -> bool:
        """
        Check if the ciphertext can be successfully decrypted.

        Args:
            ciphertext: Encrypted string to test.

        Returns:
            True if decryption succeeds, False otherwise.
        """
        try:
            self.decrypt(ciphertext)
            return True
        except EncryptionError:
            return False

    def mask_key(self, api_key: str, visible_chars: int = 4) -> str:
        """
        Mask an API key for display purposes.
        Shows only the last N characters.

        Args:
            api_key: The API key to mask.
            visible_chars: Number of characters to show at the end.

        Returns:
            Masked string like '****abcd'
        """
        if not api_key:
            return ""

        if len(api_key) <= visible_chars:
            return "*" * len(api_key)

        mask_length = len(api_key) - visible_chars
        return "*" * mask_length + api_key[-visible_chars:]

    @staticmethod
    def generate_key() -> str:
        """
        Generate a new Fernet encryption key.

        Returns:
            A new URL-safe base64-encoded 32-byte key.
        """
        return Fernet.generate_key().decode()


# Singleton instance for convenience
_encryption_service: Optional[EncryptionService] = None


def get_encryption_service() -> EncryptionService:
    """
    Get the singleton encryption service instance.
    Creates one if it doesn't exist.

    Returns:
        EncryptionService instance.
    """
    global _encryption_service
    if _encryption_service is None:
        _encryption_service = EncryptionService()
    return _encryption_service
