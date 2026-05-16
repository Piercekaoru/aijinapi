use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    message::{Mailbox, header::ContentType},
    transport::smtp::{Error as SmtpError, authentication::Credentials},
};
use thiserror::Error;

use crate::config::{SmtpConfig, SmtpTlsMode};

pub type SharedEmailSender = Arc<dyn EmailSender>;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerificationEmail {
    pub to_email: String,
    pub to_name: String,
    pub verification_url: String,
}

#[async_trait]
pub trait EmailSender: Send + Sync {
    async fn send_verification_email(&self, email: VerificationEmail)
    -> Result<(), EmailSendError>;
}

#[derive(Debug, Error)]
pub enum EmailSendError {
    #[error("SMTP email is not configured")]
    NotConfigured,
    #[error("invalid email address")]
    Address(#[from] lettre::address::AddressError),
    #[error("could not build email message")]
    Message(#[from] lettre::error::Error),
    #[error("SMTP delivery failed")]
    Smtp(#[from] SmtpError),
}

pub struct DisabledEmailSender;

#[async_trait]
impl EmailSender for DisabledEmailSender {
    async fn send_verification_email(
        &self,
        _email: VerificationEmail,
    ) -> Result<(), EmailSendError> {
        Err(EmailSendError::NotConfigured)
    }
}

pub struct SmtpEmailSender {
    mailer: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
}

impl SmtpEmailSender {
    pub fn new(config: &SmtpConfig) -> Result<Self, EmailSendError> {
        let mut builder = match config.tls_mode {
            SmtpTlsMode::StartTls => {
                AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.host)?
            }
            SmtpTlsMode::Implicit => AsyncSmtpTransport::<Tokio1Executor>::relay(&config.host)?,
            SmtpTlsMode::None => {
                AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&config.host)
            }
        }
        .port(config.port);

        if let (Some(username), Some(password)) = (&config.username, &config.password) {
            builder = builder.credentials(Credentials::new(username.clone(), password.clone()));
        }

        Ok(Self {
            mailer: builder.build(),
            from: Mailbox::new(Some(config.from_name.clone()), config.from_email.parse()?),
        })
    }
}

#[async_trait]
impl EmailSender for SmtpEmailSender {
    async fn send_verification_email(
        &self,
        email: VerificationEmail,
    ) -> Result<(), EmailSendError> {
        let to = Mailbox::new(Some(email.to_name.clone()), email.to_email.parse()?);
        let body = verification_email_body(&email.verification_url);
        let message = Message::builder()
            .from(self.from.clone())
            .to(to)
            .subject("验证你的 OpenAchieve 邮箱")
            .header(ContentType::TEXT_PLAIN)
            .body(body)?;

        self.mailer.send(message).await?;
        Ok(())
    }
}

#[derive(Default)]
pub struct InMemoryEmailSender {
    sent: Mutex<Vec<VerificationEmail>>,
}

impl InMemoryEmailSender {
    pub fn shared() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn sent(&self) -> Vec<VerificationEmail> {
        self.sent
            .lock()
            .expect("email sender mutex poisoned")
            .clone()
    }
}

#[async_trait]
impl EmailSender for InMemoryEmailSender {
    async fn send_verification_email(
        &self,
        email: VerificationEmail,
    ) -> Result<(), EmailSendError> {
        self.sent
            .lock()
            .expect("email sender mutex poisoned")
            .push(email);
        Ok(())
    }
}

fn verification_email_body(verification_url: &str) -> String {
    format!(
        "欢迎使用 OpenAchieve。\n\n请点击下面的链接验证邮箱：\n{verification_url}\n\n此链接将在 24 小时后失效。如果这不是你本人操作，可以忽略这封邮件。"
    )
}
