use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct PaginationQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

pub fn normalize_pagination(query: &PaginationQuery, max_per_page: i64) -> (i64, i64, i64) {
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(20).clamp(1, max_per_page);
    let offset = (page - 1) * per_page;
    (page, per_page, offset)
}

pub fn total_pages(total: i64, per_page: i64) -> i64 {
    if total <= 0 {
        0
    } else {
        (total + per_page - 1) / per_page
    }
}

