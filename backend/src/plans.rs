pub const FREE_PLAN: &str = "free";
pub const PLUS_PLAN: &str = "plus";
pub const FREE_MONTHLY_REQUEST_LIMIT: i32 = 500;
pub const PLUS_MONTHLY_REQUEST_LIMIT: i32 = 1500;

pub fn monthly_limit_for_plan(plan: &str) -> i32 {
    match plan {
        PLUS_PLAN => PLUS_MONTHLY_REQUEST_LIMIT,
        _ => FREE_MONTHLY_REQUEST_LIMIT,
    }
}
