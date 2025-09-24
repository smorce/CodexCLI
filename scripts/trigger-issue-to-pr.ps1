Param(
  [Parameter(ParameterSetName = 'ByNumber', Mandatory = $true)] [int] $IssueNumber,
  [Parameter(ParameterSetName = 'ByUrl', Mandatory = $true)] [string] $IssueUrl,
  [string] $WorkflowPath = '.github/workflows/issue-to-pr.yaml',
  [string] $Label = 'codex',
  [int] $TimeoutSec = 300,
  [int] $PollIntervalSec = 5,
  [switch] $OpenInBrowser
)

$ErrorActionPreference = 'Stop'

function Write-Info([string] $msg) {
  Write-Host "[INFO] $msg"
}

function Write-Warn([string] $msg) {
  Write-Warning "$msg"
}

function Write-Err([string] $msg) {
  Write-Error "$msg"
}

try {
  # Check gh availability and auth
  gh --version | Out-Null
  gh auth status | Out-Null
} catch {
  Write-Err "gh CLI is not available or not authenticated. Please run 'gh auth login'."
  exit 1
}

# Resolve IssueNumber if only URL was provided
if (-not $PSBoundParameters.ContainsKey('IssueNumber')) {
  if (-not $PSBoundParameters.ContainsKey('IssueUrl')) {
    Write-Err 'Either -IssueNumber or -IssueUrl must be provided.'
    exit 1
  }
  if ($IssueUrl -match '/issues/(\d+)$') {
    $IssueNumber = [int]$Matches[1]
  } else {
    Write-Err "Failed to parse issue number from URL: $IssueUrl"
    exit 1
  }
}

$startUtc = [DateTime]::UtcNow
Write-Info "Triggering issues.labeled for issue #$IssueNumber with label '$Label'"

# Remove label if present (ignore failures)
try {
  gh issue edit $IssueNumber --remove-label $Label | Out-Null
} catch {
  Write-Info "Label '$Label' was not present. Continuing."
}

Start-Sleep -Seconds 2

# Add label (this should fire the workflow)
gh issue edit $IssueNumber --add-label $Label | Out-Null
Write-Info "Label added. Waiting for workflow run to appear..."

$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSec)
$runId = $null

while ([DateTime]::UtcNow -lt $deadline) {
  try {
    $runs = gh run list --workflow "$WorkflowPath" --limit 10 --json databaseId,status,conclusion,createdAt,workflowName | ConvertFrom-Json
  } catch {
    Write-Warn "Failed to fetch run list: $($_.Exception.Message)"
    Start-Sleep -Seconds $PollIntervalSec
    continue
  }

  if ($runs -isnot [System.Array]) { $runs = @($runs) }

  # Find the most recent run created after we started
  $candidate = $runs | Where-Object {
    # createdAt is ISO8601 string
    try {
      ([DateTime]::Parse($_.createdAt)).ToUniversalTime() -ge $startUtc
    } catch { $false }
  } | Sort-Object createdAt -Descending | Select-Object -First 1

  if ($candidate) {
    $runId = $candidate.databaseId
    try {
      $run = gh run view $runId --json databaseId,status,conclusion,url | ConvertFrom-Json
      Write-Info "Run $($run.databaseId) status=$($run.status) url=$($run.url)"
      if ($run.status -eq 'completed') {
        Write-Host ($run | ConvertTo-Json -Depth 5)
        if ($OpenInBrowser) { try { Start-Process $run.url } catch { } }

        # Try to summarize outcomes tied to the Issue (comments, PR existence)
        try {
          $commentsObj = gh issue view $IssueNumber --json comments | ConvertFrom-Json
          $newComments = @()
          if ($commentsObj -and $commentsObj.comments) {
            $newComments = $commentsObj.comments | Where-Object {
              try { ([DateTime]::Parse($_.createdAt)).ToUniversalTime() -ge $startUtc } catch { $false }
            }
          }
          if ($newComments.Count -gt 0) {
            Write-Info ("New issue comments since trigger: " + $newComments.Count)
          } else {
            Write-Info 'No new issue comments detected since trigger.'
          }
        } catch {
          Write-Warn "Could not fetch issue comments: $($_.Exception.Message)"
        }

        try {
          $branch = "codex/issue-$IssueNumber"
          $pr = gh pr list --search "head:$branch" --json url,headRefName --limit 1 | ConvertFrom-Json
          if ($pr -and $pr[0] -and $pr[0].url) {
            Write-Info ("Detected PR from $branch -> " + $pr[0].url)
          } else {
            Write-Info "No PR detected for head branch $branch."
          }
        } catch {
          Write-Warn "Could not query PRs: $($_.Exception.Message)"
        }
        if ($run.conclusion -and $run.conclusion -ne 'success') { exit 2 }
        exit 0
      }
    } catch {
      Write-Warn "Failed to view run ${runId}: $($_.Exception.Message)"
    }
  }

  Start-Sleep -Seconds $PollIntervalSec
}

Write-Err "Timed out waiting for workflow run after labeling issue #$IssueNumber."
if ($runId) { Write-Host "Last observed runId=$runId" }
exit 3


