use std::sync::Mutex;

use tauri::{AppHandle, Manager};

const ZOOM_MIN: f64 = 0.2;
const ZOOM_MAX: f64 = 10.0;
const ZOOM_DEFAULT: f64 = 1.0;
/// One menu or keyboard step, matching a 20% change.
const ZOOM_STEP_RATIO: f64 = 1.2;
const MAIN_WINDOW_LABEL: &str = "main";

pub struct ZoomState {
    factor: Mutex<f64>,
}

impl Default for ZoomState {
    fn default() -> Self {
        Self {
            factor: Mutex::new(ZOOM_DEFAULT),
        }
    }
}

fn scale_zoom(app: &AppHandle, multiplier: f64) -> Result<(), String> {
    if !multiplier.is_finite() || multiplier <= 0.0 {
        return Err("Zoom multiplier must be a positive number".into());
    }

    let state = app.state::<ZoomState>();
    let factor = {
        let mut current = state.factor.lock().map_err(|error| error.to_string())?;
        *current = (*current * multiplier).clamp(ZOOM_MIN, ZOOM_MAX);
        *current
    };

    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Err("Main window is not available".into());
    };

    window.set_zoom(factor).map_err(|error| error.to_string())
}

pub fn zoom_in(app: &AppHandle) -> Result<(), String> {
    scale_zoom(app, ZOOM_STEP_RATIO)
}

pub fn zoom_out(app: &AppHandle) -> Result<(), String> {
    scale_zoom(app, 1.0 / ZOOM_STEP_RATIO)
}

pub fn zoom_reset(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<ZoomState>();
    {
        let mut current = state.factor.lock().map_err(|error| error.to_string())?;
        *current = ZOOM_DEFAULT;
    }

    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Err("Main window is not available".into());
    };

    window
        .set_zoom(ZOOM_DEFAULT)
        .map_err(|error| error.to_string())
}

pub fn zoom_by(app: &AppHandle, multiplier: f64) -> Result<(), String> {
    scale_zoom(app, multiplier)
}

#[tauri::command]
pub fn zoom_in_command(app: AppHandle) -> Result<(), String> {
    zoom_in(&app)
}

#[tauri::command]
pub fn zoom_out_command(app: AppHandle) -> Result<(), String> {
    zoom_out(&app)
}

#[tauri::command]
pub fn zoom_reset_command(app: AppHandle) -> Result<(), String> {
    zoom_reset(&app)
}

#[tauri::command]
pub fn zoom_by_command(app: AppHandle, multiplier: f64) -> Result<(), String> {
    zoom_by(&app, multiplier)
}
