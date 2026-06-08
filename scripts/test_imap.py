"""Quick IMAP connectivity test for WeCom Mail."""
import imaplib
import sys


def test(email_addr: str, password: str, host: str = "imap.exmail.qq.com", port: int = 993):
    print(f"Connecting to {host}:{port} ...")
    try:
        imap = imaplib.IMAP4_SSL(host, port)
        print("SSL connected.")
    except Exception as e:
        print(f"SSL connection failed: {e}")
        return

    try:
        imap.login(email_addr, password)
        print("Login OK!")
    except imaplib.IMAP4.error as e:
        print(f"Login FAILED: {e}")
        imap.logout()
        return

    try:
        imap.select("INBOX", readonly=True)
        _, data = imap.search(None, "ALL")
        count = len(data[0].split()) if data[0] else 0
        print(f"INBOX has {count} messages.")
    finally:
        imap.logout()
        print("Done.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python scripts/test_imap.py <email> <password>")
        sys.exit(1)
    test(sys.argv[1], sys.argv[2])
