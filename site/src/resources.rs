use tera::Tera;
use tokio::sync::RwLock;

use rust_embed::RustEmbed;

/// Static files and templates are embedded into the binary (in release mode) or hot-reloaded
/// from the `site` directory (in debug mode).
#[derive(RustEmbed)]
#[folder = "static/"]
#[include = "*.js"]
#[include = "*.css"]
#[include = "*.svg"]
#[include = "*.png"]
struct StaticAssets;

#[derive(RustEmbed)]
#[folder = "templates/"]
#[include = "*.html"]
struct TemplateAssets;

pub struct ResourceResolver {
    tera: RwLock<Tera>,
}

impl ResourceResolver {
    pub fn new() -> anyhow::Result<Self> {
        let tera = load_templates()?;

        Ok(Self {
            tera: RwLock::new(tera),
        })
    }

    pub fn get_static_asset(&self, path: &str) -> Option<Vec<u8>> {
        StaticAssets::get(path).map(|file| file.data.to_vec())
    }

    pub async fn get_template(&self, path: &str) -> anyhow::Result<Vec<u8>> {
        // Live-reload the template if we're in debug mode
        #[cfg(debug_assertions)]
        {
            *self.tera.write().await = load_templates()?;
        }

        let context = tera::Context::new();
        let rendered = self.tera.read().await.render(path, &context)?;
        Ok(rendered.into_bytes())
    }
}

fn load_templates() -> anyhow::Result<Tera> {
    let templates = TemplateAssets::iter().map(|path| {
        (
            path.to_string(),
            String::from_utf8(TemplateAssets::get(&path).unwrap().data.to_vec()).unwrap(),
        )
    });
    let mut tera = Tera::default();
    tera.add_raw_templates(templates)?;
    Ok(tera)
}
