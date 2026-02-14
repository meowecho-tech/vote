use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

pub struct RateLimiter {
    buckets: Mutex<HashMap<String, Vec<Instant>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            buckets: Mutex::new(HashMap::new()),
        }
    }

    pub fn check(&self, key: String, limit: usize, window: Duration) -> bool {
        let mut buckets = self.buckets.lock().expect("rate limiter poisoned");
        let now = Instant::now();

        let entries = buckets.entry(key).or_default();
        entries.retain(|t| now.duration_since(*t) <= window);

        if entries.len() >= limit {
            return false;
        }

        entries.push(now);
        true
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::RateLimiter;

    #[test]
    fn blocks_after_limit_within_window() {
        let limiter = RateLimiter::new();
        let key = "k".to_string();

        assert!(limiter.check(key.clone(), 2, Duration::from_secs(30)));
        assert!(limiter.check(key.clone(), 2, Duration::from_secs(30)));
        assert!(!limiter.check(key, 2, Duration::from_secs(30)));
    }
}
