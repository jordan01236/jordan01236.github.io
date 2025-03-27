document.addEventListener("DOMContentLoaded", function () {
    const terminalContainer = document.getElementById("terminal-container");
    let isRoot = false;

    // List of valid commands
    const validCommands = ["whoami", "help", "clear", "blog", "about", "sudo su", "cat credit_card_details"];

    // Function to display terminal content
    function displayOutput(output) {
        const outputDiv = document.createElement("div");
        outputDiv.className = "output";
        if (isRoot) outputDiv.style.color = "#ff4444";
        outputDiv.textContent = output;
        terminalContainer.appendChild(outputDiv);
    }

    // Function to display available commands
    function displayCommands() {
        // Remove existing command list
        const oldCommandList = document.querySelector('.command-list');
        if (oldCommandList) oldCommandList.remove();

        let commandList = "Available commands:\n- whoami\n- help\n- clear\n- blog\n- about\n- sudo su";
        if (isRoot) {
            commandList += "\n- cat credit_card_details";
        }
        const commandDiv = document.createElement("div");
        commandDiv.className = "command-list";
        commandDiv.textContent = commandList;
        terminalContainer.appendChild(commandDiv);
    }

    // Handle the entered command
    function handleCommand(command) {
        if (command === "whoami") {
            displayOutput(isRoot ? "root" : "Hello! I'm Jordan, a cybersecurity enthusiast focused on hacking/cybersecurity. I have been learning pentesting for just about 4 years now. Visit my about page to learn more!");
        } else if (command === "help") {
            let helpText = "Available commands:\n- whoami\n- help\n- clear\n- blog\n- about\n- sudo su";
            if (isRoot) {
                helpText += "\n- cat credit_card_details";
            }
            displayOutput(helpText);
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

                // Update command list display
                displayCommands();

                // Update existing prompts
                document.querySelectorAll('.prompt').forEach(prompt => {
                    prompt.textContent = "root@kali:~# ";
                    prompt.style.color = "#ff4444";
                });
            }
        } else if (command === "cat credit_card_details") {
            if (isRoot) {
                window.location.href = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
            } else {
                displayOutput("cat: credit_card_details: Permission denied");
            }
        } else {
            displayOutput(`Command not found: ${command}\nType 'help' for available commands.`);
        }
    }

    // Create the prompt and input field
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

        // Handle input events
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

    // Display initial terminal content
    displayCommands();
    createPrompt();
});