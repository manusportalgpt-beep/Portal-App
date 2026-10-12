const BMCLAPI_BASE: &str = "https://bmclapi2.bangbang93.com";

/// Rewrites Minecraft and Maven artifact URLs to the corresponding BMCLAPI paths.
/// URLs from unrelated hosts are left untouched because BMCLAPI is not a general proxy.
pub(crate) fn bmclapi_url(url: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(url).ok()?;
    let host = parsed.host_str()?;
    let path = parsed.path();

    let mirrored_path = match host {
        "launchermeta.mojang.com"
        | "launcher.mojang.com"
        | "piston-data.mojang.com"
        | "piston-meta.mojang.com" => path.to_string(),
        "resources.download.minecraft.net" => format!("/objects{path}"),
        "libraries.minecraft.net"
        | "maven.minecraftforge.net"
        | "maven.fabricmc.net"
        | "maven.neoforged.net"
        | "maven.quiltmc.org" => format!("/maven{path}"),
        "files.minecraftforge.net" if path.starts_with("/maven/") => {
            path.to_string()
        }
        _ => return None,
    };

    let query = parsed
        .query()
        .map(|query| format!("?{query}"))
        .unwrap_or_default();
    Some(format!("{BMCLAPI_BASE}{mirrored_path}{query}"))
}

#[cfg(test)]
mod tests {
    use super::bmclapi_url;

    #[test]
    fn rewrites_minecraft_metadata_hosts() {
        assert_eq!(
            bmclapi_url(
                "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
            ),
            Some(format!(
                "https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json"
            ))
        );
        assert_eq!(
            bmclapi_url(
                "https://piston-data.mojang.com/v1/objects/abc/client.jar"
            ),
            Some(
                "https://bmclapi2.bangbang93.com/v1/objects/abc/client.jar"
                    .to_string()
            )
        );
    }

    #[test]
    fn rewrites_minecraft_asset_and_maven_hosts() {
        assert_eq!(
            bmclapi_url("https://resources.download.minecraft.net/ab/abcdef"),
            Some(
                "https://bmclapi2.bangbang93.com/objects/ab/abcdef".to_string()
            )
        );
        assert_eq!(
            bmclapi_url("https://libraries.minecraft.net/com/example/lib/1/lib.jar"),
            Some(
                "https://bmclapi2.bangbang93.com/maven/com/example/lib/1/lib.jar"
                    .to_string()
            )
        );
        assert_eq!(
            bmclapi_url(
                "https://files.minecraftforge.net/maven/net/minecraftforge/forge/1/forge.jar"
            ),
            Some(
                "https://bmclapi2.bangbang93.com/maven/net/minecraftforge/forge/1/forge.jar"
                    .to_string()
            )
        );
    }

    #[test]
    fn preserves_query_and_leaves_unrelated_hosts_untouched() {
        assert_eq!(
            bmclapi_url("https://libraries.minecraft.net/a.jar?download=1"),
            Some(
                "https://bmclapi2.bangbang93.com/maven/a.jar?download=1"
                    .to_string()
            )
        );
        assert_eq!(
            bmclapi_url("https://cdn.modrinth.com/data/project/file.jar"),
            None
        );
        assert_eq!(
            bmclapi_url("https://api.azul.com/metadata/v1/zulu/packages"),
            None
        );
    }
}
