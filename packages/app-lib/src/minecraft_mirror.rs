//! BMCLAPI mirror for Minecraft metadata and game files.
//!
//! Modrinth/CurseForge content keeps its original URL. Only official Minecraft
//! and Maven/Fabric/Forge infrastructure URLs are redirected to BMCLAPI.

const BMCLAPI_BASE: &str = "https://bmclapi2.bangbang93.com";

/// Rewrite a URL owned by Mojang or a Minecraft Maven repository to BMCLAPI.
/// Non-Minecraft URLs are returned unchanged.
pub(crate) fn rewrite(url: &str) -> String {
    let mappings = [
        ("https://piston-meta.mojang.com", BMCLAPI_BASE),
        ("https://launchermeta.mojang.com", BMCLAPI_BASE),
        ("https://piston-data.mojang.com", BMCLAPI_BASE),
        ("https://launcher.mojang.com", BMCLAPI_BASE),
        ("https://resources.download.minecraft.net", "/assets"),
        ("https://libraries.minecraft.net", "/maven"),
        ("https://maven.fabricmc.net", "/maven"),
        ("https://meta.fabricmc.net", "/fabric-meta"),
        ("https://maven.minecraftforge.net", "/maven"),
    ];

    for (from, to) in mappings {
        if let Some(rest) = url.strip_prefix(from) {
            return if to.starts_with("http") {
                format!("{to}{rest}")
            } else {
                format!("{BMCLAPI_BASE}{to}{rest}")
            };
        }
    }

    url.to_string()
}

#[cfg(test)]
mod tests {
    use super::rewrite;

    #[test]
    fn rewrites_minecraft_assets_and_libraries() {
        assert_eq!(
            rewrite("https://resources.download.minecraft.net/ab/abcdef"),
            "https://bmclapi2.bangbang93.com/assets/ab/abcdef"
        );
        assert_eq!(
            rewrite("https://libraries.minecraft.net/org/example/a.jar"),
            "https://bmclapi2.bangbang93.com/maven/org/example/a.jar"
        );
    }

    #[test]
    fn leaves_third_party_content_untouched() {
        let url = "https://cdn.modrinth.com/data/example/file.jar";
        assert_eq!(rewrite(url), url);
    }
}
