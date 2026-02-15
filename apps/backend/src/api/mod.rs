use actix_web::web;

pub mod auth;
pub mod contests;
pub mod elections;
pub mod health;
mod pagination;
mod voter_roll_import;
pub mod votes;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(web::scope("/health").configure(health::configure))
        .service(
            web::scope("/api/v1")
                .configure(auth::configure)
                .configure(contests::configure)
                .configure(elections::configure)
                .configure(votes::configure),
        );
}
