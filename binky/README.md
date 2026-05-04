Prompt used to create Agent.
```markdown
# Intro
in binky folder create a prompt custom agent (AGENT.md) that does this. upon invocation - 1. analyse the current code base or selected piece of code or file 2. based on the curator tools end points find out which is are the curator files relevant to this project. 3. transfers all the relevant files into this root of the current project as the destination override it wherever applicable.

it has two modes - prepare and apply mode.  Prompt if user wants to prepare or directly apply (it will skip waiting for confirmation from user.)

## prepare mode
in prepare mode it will create a json in the temp folder with the format - similar to the TransferFile pydantic  

class TransferFile(BaseModel):
    file: str
    destination: str | None = None


class TransferRequest(BaseModel):
    destination_folder: str
    files: list[TransferFile] = Field(default_factory=list)   
    ignore: boolean
    reason: str

except it will have to additional attribute in transfer file --> ignore: boolean and reason: str (reason why the file is to be ignored or not).  

## apply mode
after the use confirms the json generated, you will use the transfer tool to invoke all the files to be tranfered to the root.

If you have any questions do ask me.
```
