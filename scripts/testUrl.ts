
const urls = [
    'http://camelo.vip:80/video.mp4',
    'http://camelo.vip/video.mp4',
    'https://secure.com:443/video.mp4',
    'http://other.com:8080/video.mp4'
];

console.log('--- URL Origin Test ---');
urls.forEach(u => {
    const urlObj = new URL(u);
    console.log(`Input: ${u}`);
    console.log(`Origin: ${urlObj.origin}`);
    console.log(`Hostname: ${urlObj.hostname}`);
    console.log(`Protocol: ${urlObj.protocol}`);
    console.log('---');
});
