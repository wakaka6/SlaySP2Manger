use std::fs;
use std::io;
use std::path::Path;

pub fn read_unicode_text_file(path: impl AsRef<Path>) -> io::Result<String> {
    let bytes = fs::read(path)?;
    decode_unicode_text(&bytes)
}

fn decode_unicode_text(bytes: &[u8]) -> io::Result<String> {
    if let Some(bytes) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        return decode_utf8(bytes);
    }

    if let Some(bytes) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        return decode_utf16(bytes, true);
    }

    if let Some(bytes) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        return decode_utf16(bytes, false);
    }

    decode_utf8(bytes)
}

fn decode_utf8(bytes: &[u8]) -> io::Result<String> {
    String::from_utf8(bytes.to_vec())
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error.to_string()))
}

fn decode_utf16(bytes: &[u8], little_endian: bool) -> io::Result<String> {
    let mut chunks = bytes.chunks_exact(2);
    if !chunks.remainder().is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "text payload has an odd number of UTF-16 bytes",
        ));
    }

    let units = chunks.by_ref().map(|pair| {
        if little_endian {
            u16::from_le_bytes([pair[0], pair[1]])
        } else {
            u16::from_be_bytes([pair[0], pair[1]])
        }
    });

    let mut output = String::new();
    for decoded in std::char::decode_utf16(units) {
        let ch = decoded.map_err(|error| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("invalid UTF-16 text: {error}"),
            )
        })?;
        output.push(ch);
    }

    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::decode_unicode_text;

    #[test]
    fn decodes_plain_utf8() {
        let decoded = decode_unicode_text(br#"{"name":"BaseLib"}"#).unwrap();
        assert_eq!(decoded, r#"{"name":"BaseLib"}"#);
    }

    #[test]
    fn decodes_utf8_with_bom() {
        let bytes = [0xEF, 0xBB, 0xBF, b'{', b'}'];
        let decoded = decode_unicode_text(&bytes).unwrap();
        assert_eq!(decoded, "{}");
    }

    #[test]
    fn decodes_utf16_le_with_bom() {
        let bytes = [
            0xFF, 0xFE, 0x7B, 0x00, 0x22, 0x00, 0x61, 0x00, 0x22, 0x00, 0x3A, 0x00, 0x31, 0x00,
            0x7D, 0x00,
        ];
        let decoded = decode_unicode_text(&bytes).unwrap();
        assert_eq!(decoded, r#"{"a":1}"#);
    }

    #[test]
    fn decodes_utf16_be_with_bom() {
        let bytes = [
            0xFE, 0xFF, 0x00, 0x7B, 0x00, 0x22, 0x00, 0x61, 0x00, 0x22, 0x00, 0x3A, 0x00, 0x31,
            0x00, 0x7D,
        ];
        let decoded = decode_unicode_text(&bytes).unwrap();
        assert_eq!(decoded, r#"{"a":1}"#);
    }

    #[test]
    fn rejects_invalid_utf16_length() {
        let bytes = [0xFF, 0xFE, 0x41];
        let error = decode_unicode_text(&bytes).unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
    }
}
