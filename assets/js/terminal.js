document.addEventListener("DOMContentLoaded", function () {
    const terminalContainer = document.getElementById("terminal-container");
    let isRoot = false;

    // Updated valid commands list with sudo su
    const validCommands = ["whoami", "help", "clear", "blog", "about", "sudo su"];

    function displayOutput(output) {
        const outputDiv = document.createElement("div");
        outputDiv.className = "output";
        if (isRoot) outputDiv.style.color = "#ff4444";
        outputDiv.textContent = output;
        terminalContainer.appendChild(outputDiv);
    }

    function displayCommands() {
        const commandList = "Available commands:\n- whoami\n- help\n- clear\n- blog\n- about\n- sudo su"; // Added sudo su
        const commandDiv = document.createElement("div");
        commandDiv.className = "command-list";
        commandDiv.textContent = commandList;
        terminalContainer.appendChild(commandDiv);
    }

    function handleCommand(command) {
        if (command === "whoami") {
            displayOutput(isRoot ? "root" : "Hello! I'm Jordan, a cybersecurity enthusiast focused on hacking/cybersecurity. I have been learning pentesting for just about 4 years now. Vist my about page to learn more.");
        } else if (command === "help") {
            displayOutput("Available commands:\n- whoami\n- help\n- clear\n- blog\n- about\n- sudo su"); // Added sudo su
        } else if (command === "clear") {
            terminalContainer.innerHTML = '';
            displayCommands();
            createPrompt();
        } else if (command === "blog") {
            window.location.href = "blog.html";
        } else if (command === "about") {
            window.location.href = "about.html";
        } else if (command === "sudo su") {
            if (!isRoot) {
                isRoot = true;
                terminalContainer.style.color = "#ff4444";
                displayOutput("Congratulations on hacking the terminal :)");
                document.querySelectorAll('.prompt').forEach(prompt => {
                    prompt.textContent = "root@kali:~# ";
                    prompt.style.color = "#ff4444";
                });
            }
        } else {
            displayOutput(`Command not found: ${command}\nType 'help' for available commands.`);
        }
    }

    function createPrompt() {
        const promptLine = document.createElement("div");
        promptLine.className = "prompt-line";

        const promptDiv = document.createElement("span");
        promptDiv.className = "prompt";
        promptDiv.textContent = isRoot ? "root@kali:~# " : "jordan@kali:~$ ";
        promptDiv.style.color = isRoot ? "#ff4444" : "#33ff33";
        promptLine.appendChild(promptDiv);

        const inputField = document.createElement("input");
        inputField.type = "text";
        inputField.className = "command-input";
        inputField.style.color = isRoot ? "#ff4444" : "#33ff33";
        inputField.autofocus = true;
        promptLine.appendChild(inputField);

        terminalContainer.appendChild(promptLine);
        inputField.focus();

        function handleInput(event) {
            if (event.key === "Enter") {
                const command = inputField.value.trim();
                if (command) {
                    const commandDisplay = document.createElement("div");
                    commandDisplay.className = "command-display";
                    commandDisplay.textContent = (isRoot ? "root@kali:~# " : "jordan@kali:~$ ") + command;
                    commandDisplay.style.color = isRoot ? "#ff4444" : "#33ff33";
                    terminalContainer.insertBefore(commandDisplay, promptLine);

                    handleCommand(command);
                }
                promptLine.remove();

                if (!["blog", "about"].includes(command)) {
                    createPrompt();
                }
            }
        }

        inputField.addEventListener("keydown", handleInput);
    }

    displayCommands();
    createPrompt();
});