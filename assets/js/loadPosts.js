document.addEventListener("DOMContentLoaded", function () {
    fetch('/posts.json')  // Added leading slash for absolute path
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            const container = document.getElementById('post-container');

            data.posts.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(post => {
                const postHTML = `
                    <li class="post-list-li">
                        <span class="post-meta">${new Date(post.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                })}</span>
                        <h3>
                            <a class="post-link" href="${encodeURI(post.filename)}">${post.title}</a>
                        </h3>
                        <div class="post-excerpt">
                            <p>${post.excerpt}</p>
                        </div>
                    </li>
                `;
                container.insertAdjacentHTML('beforeend', postHTML);
            });
        })
        .catch(error => {
            console.error('Post loading error:', error);
            document.getElementById('post-container').innerHTML = `
                <li class="error">
                    Error loading posts: ${error.message}
                </li>
            `;
        });
});