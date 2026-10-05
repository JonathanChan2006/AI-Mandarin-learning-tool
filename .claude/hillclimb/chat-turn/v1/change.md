One combined call: the tutor replies and reports its analysis through a tool call in the same request.

`ChatService` runs in `single` mode. One streaming request to `claude-opus-5` at low effort: the reply arrives as text, then the model calls the strict `report_analysis` tool with the same schema the grader uses. The tutor's system prompt gains one paragraph telling it to call the tool after replying and never to mention it. The model sees the whole conversation, including the tutor line the student was answering.
