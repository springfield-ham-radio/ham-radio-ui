use serde::Deserialize;
use serde_json::Value;
use sqlx::sqlite::{SqliteArguments, SqliteConnectOptions};
use sqlx::{Arguments, Connection, SqliteConnection};
use std::str::FromStr;
use tauri::Manager;

#[derive(Deserialize)]
pub struct SqlStatement {
    pub sql: String,
    pub values: Vec<Value>,
}

/// Run every statement on one connection. A failure rolls the batch back.
#[tauri::command]
pub async fn execute_sqlite_transaction(
    app: tauri::AppHandle,
    statements: Vec<SqlStatement>,
) -> Result<(), String> {
    if statements.is_empty() {
        return Ok(());
    }

    let directory = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let path = directory.join("ham-radio.db");
    let url = format!("sqlite://{}", path.display().to_string().replace('\\', "/"));
    let options = SqliteConnectOptions::from_str(&url)
        .map_err(|error| error.to_string())?
        .create_if_missing(false);
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| error.to_string())?;

    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut connection)
        .await
        .map_err(|error| error.to_string())?;

    for statement in &statements {
        if let Err(error) = execute_statement(&mut connection, statement).await {
            let _ = sqlx::query("ROLLBACK").execute(&mut connection).await;
            return Err(error);
        }
    }

    sqlx::query("COMMIT")
        .execute(&mut connection)
        .await
        .map_err(|error| error.to_string())?;

    Ok(())
}

async fn execute_statement(connection: &mut SqliteConnection, statement: &SqlStatement) -> Result<(), String> {
    let mut arguments = SqliteArguments::default();

    for value in &statement.values {
        bind_value(&mut arguments, value)?;
    }

    sqlx::query_with(&sqlite_placeholders(&statement.sql), arguments)
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn bind_value<'a>(arguments: &mut SqliteArguments<'a>, value: &'a Value) -> Result<(), String> {
    match value {
        Value::Null => arguments.add(Option::<String>::None).map_err(|error| error.to_string()),
        Value::Bool(flag) => arguments.add(flag).map_err(|error| error.to_string()),
        Value::Number(number) => {
            if let Some(integer) = number.as_i64() {
                arguments.add(integer).map_err(|error| error.to_string())
            } else if let Some(float) = number.as_f64() {
                arguments.add(float).map_err(|error| error.to_string())
            } else {
                Err("Channel pack transaction received a number SQLite cannot store".into())
            }
        }
        Value::String(text) => arguments.add(text).map_err(|error| error.to_string()),
        _ => Err("Channel pack transaction received a value SQLite cannot store".into()),
    }
}

/// The library SQL uses `$1` placeholders. sqlx SQLite binds `?` in order.
fn sqlite_placeholders(sql: &str) -> String {
    let mut result = String::with_capacity(sql.len());
    let mut chars = sql.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '$' && chars.peek().is_some_and(|next| next.is_ascii_digit()) {
            while chars.peek().is_some_and(|next| next.is_ascii_digit()) {
                chars.next();
            }

            result.push('?');
            continue;
        }

        result.push(ch);
    }

    result
}
