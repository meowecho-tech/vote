use actix_web::web;

pub mod auth;
pub mod elections;
pub mod health;
pub mod votes;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(web::scope("/health").configure(health::configure))
        .service(
            web::scope("/api/v1")
                .configure(auth::configure)
                .configure(elections::configure)
                .configure(votes::configure),
        );
}
