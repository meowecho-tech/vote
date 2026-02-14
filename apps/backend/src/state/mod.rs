use std::sync::Arc;

use crate::security::rate_limit::RateLimiter;

#[derive(Clone)]
pub struct AppState {
    pub rate_limiter: Arc<RateLimiter>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            rate_limiter: Arc::new(RateLimiter::new()),
        }
    }
}
