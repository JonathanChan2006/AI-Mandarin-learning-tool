Two calls in parallel: the same two prompts as today, started at the same time.

`ChatService` runs in `parallel` mode. The reply call and the grader call are unchanged, but they no longer wait for each other, so the turn takes as long as the slower one. Because the reply does not exist yet when grading starts, the grader is shown the tutor line the student was answering instead of the tutor's new reply.
