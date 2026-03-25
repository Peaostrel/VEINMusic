document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['username', 'apiKey'], (data) => {
        if (data.username && data.apiKey) {
            document.getElementById('unauth-box').style.display = 'none';
            document.getElementById('auth-box').style.display = 'block';
            document.getElementById('username-display').innerText = data.username;
        } else {
            document.getElementById('unauth-box').style.display = 'block';
            document.getElementById('auth-box').style.display = 'none';
        }
    });
});