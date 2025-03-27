document.addEventListener("DOMContentLoaded", () => {
    const headers = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
    headers.forEach(header => {
        header.addEventListener("click", (e) => {
            e.preventDefault();
            const link = `${window.location.origin}${window.location.pathname}#${header.id}`;
            navigator.clipboard.writeText(link)
                .then(console.log("Link copied: ", link))
                .catch(err => console.error("failed to copy link: ", err));
        });
    });
});

