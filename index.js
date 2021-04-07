const { getInput, setFailed, setOutput } = require("@actions/core");
const github = require("@actions/github");
const { default: fetch } = require("node-fetch");

const job = async () => {
  try {
    const PAT = getInput('pat')
    const { owner, repo } = github.context.repo
    const headers = { Authorization: `token ${PAT}` }
    const BASE_URI = `https://api.github.com/repos/${owner}/${repo}`
    let response = await fetch(`${BASE_URI}/contents/hits.json`, {headers})
    if (response.status === 403) {
      throw new Error(`${response.status}: ${response.statusText}`)
    }
    const initialDate = new Date().toISOString().split("T")[0]
    const defaultObject = {
      Total: 0,
      Unique: 0,
      initialDate
    }
    let { content, sha } = await response.json()
    if (!content) {
      content = {
        views: {...defaultObject},
        clones: {...defaultObject}
      }
    }
    else {
      content = JSON.parse(Buffer.from(content, 'base64').toString('utf8'))
    }
    await Promise.allSettled(
      ["views", "clones"].map(async type => {
        let result = (await (await fetch(`${BASE_URI}/traffic/${type}`, {headers})).json())[type]
        result.forEach(({ count, uniques, timestamp }) => {
          content[type][timestamp.split("T")[0]] = {
            Total: count,
            Unique: uniques
          }
        })
        content[type].Total = 0
        content[type].Unique = 0
        Object.values(content[type]).forEach(v => {
          if(!!v.Total && !!v.Unique) {
            content[type].Total += v.Total
            content[type].Unique += v.Unique
          }
        })
      })
    )
    let body = {
      message: `Update hits.json on ${new Date().toISOString().split("T")[0]}`,
      content: Buffer.from(JSON.stringify(content)).toString("base64"),
    }
    if (!!sha) {
      body.sha = sha
    }
    response = await fetch(`${BASE_URI}/contents/hits.json`, {
      method: "PUT",
      headers: {
        ...headers,
        "accept": "application/vnd.github.v3+json"
      },
      body: JSON.stringify(body)
    })
    if (response.status > 400) {
      throw new Error(`${response.status}: ${response.statusText}`)
    }
    setOutput("status", `${response.status}: ${response.statusText}`)
  } catch (error) {
    setFailed(error.message)
  }
}

job()