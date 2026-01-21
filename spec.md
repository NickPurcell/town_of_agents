# Goal
Create a recreation of Discord for agents.

# Lanugaes and dependencies
Typescript
Electron

# Splash screen
When the user first opens the software a splash screen should open with a spinning loading wheel that just says "Application Loading"

# UI
On the left side of the screen will be a column taking up abou 30% of the screen, a column on the right side taking up the same amount of space, and a viewing window in the middle taking up the rest of the space.  Upon opening the program the main window will say "Welcome to Discord for Agents, select a chat on the left, or click the new chat button to start a new chatroom.  On it there will be a button on the top with a plus on the left side that is labeled new chat, and a list of chatrooms the user has created.  Each chat will have a check emoji on the left or an X emoji, letting the user know which chats are actve or not.  RIght clicking a chatroom on this menu will allow the user to activate/deactivate the chat, or delete the chat.

## New Chat
When the user initiates a new chat, in the viewing window there will be a plus button that says add new agent.  When the user presses it a pop menu appears that will have a drop down menu for the model (initial support for gemini thinking, claude opus thinking, and gpt thinking).  The user can give the agent a name, and type in their system prompt.  The user can add as many agents as the user would like.  Below the agents and new agent button is text box where the user can enter the interval at which the agents will send messages.  Bewlow that text bos will be a text box for giving the chat a name.  Below that will be a larger text box, 4 lines long, that says "Topic" where the user can enter a question or topic that will start off the conversation and be appended to the system prompt of each agent.  Below that will be a button that says "Start Chat", before creating two agents it will be greyed out but when there are two agents it will turn green.  When the new chat is created, the program needs to assign each of the agents a color, from a list of common colors.  It needs to assign each agent a color randomly, and should not choose a color that is the same color as another agent unless there are more agents than colors.  The program should not allow you to add more than 50 agents.  

When each agent is instatiated, their system prompt should be as follows:
You are {Model Name ex "gemini 3"},a frontier AI model.
You are currently in a chat room with X other agents, and a single human.
The agents are named as follows:
Name 1
Name 2
**note, do not include the model the other agents are running off of**
You are speaking in round robin style, each agent will get a turn to speak one after the other.  The topic of conversation is:
Topic
The personality you are to embody is as follows:
System Prompt

You will respond in a casual unstructured format, no more than two paragraphs.  You may use formatting if you think it is appropriate.

## Existing chat
When in an existing chat, the left column will show each of the agents in the chat room.  Each Agent's name should be the color that they were assigned in the new chat screen.  The viewing window in the middle should look like discord: all messages are left aligned, markdown formatted text, and above each message is the name of the agent (or the User) who sent the message.  To the left of each message should be either the logo for the LLM provider or a picture of the user.  there should be an avatar folder with gemini.png, chatgpt.png, claude.png, and user.png (I will handle those).  The program should print both thinking messages and responses, with thinking messages printed in all italics and the word "Thinking" printed as the first line of the response.  The actual response should be printed as the next message.  The thinking messages should not be shown to the other agents.

## Saving messages
Messages will be saved in an list of libraries with entries "character" and "message", character is the name of the agent or the user, and message is the message that was sent.  For each LLM provider there will need to be a conversion function that goes through each message in the list and prepare the messages to submit for the agent, for each LLM provider.  It will have to compare the name of the agent to the name in the message history, and if the message was sent by that agent it will prepare it as an assistant message, and if it was sent by the user or by another agent, it will have to append "User said: " or "[Character Name] Said" to the user message.  So if a round looks like this
User: Hi Everyone!
Chad: Yo!
Sharon: Sup!
Todd: Hi there
When the message goes to chad next he would see
User: User said: Hi Everyone
Assistant: Yo!
User: Sharon Said: Sup!
User: Todd said: Hi there
