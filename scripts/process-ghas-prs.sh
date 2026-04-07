#!/bin/bash
#
# Process GitHub Advanced Security PRs Script
#
# This script automates the process of testing and merging GitHub Advanced Security
# pull requests from Dependabot, Copilot Autofix, and other GHAS automated sources.
# Requires GitHub CLI (gh) to filter PRs by author.
#
# Usage:
#   ./scripts/process-ghas-prs.sh [OPTIONS]
#
# Options:
#   --dry-run              Show what would be done without actually merging
#   --author AUTHOR        Only process PRs from AUTHOR (can be used multiple times)
#   --all                  Process all automated authors (default)
#   --force                Skip confirmation prompts and auto-merge all passing PRs
#   --push                 Auto-push batch of commits without final confirmation
#   --no-push              Never push; queue commits locally for manual push
#
# Examples:
#   ./scripts/process-ghas-prs.sh --dry-run
#   ./scripts/process-ghas-prs.sh --author dependabot
#   ./scripts/process-ghas-prs.sh --author dependabot --author copilot-autofix
#   ./scripts/process-ghas-prs.sh --force  # Auto-merge without prompts
#   ./scripts/process-ghas-prs.sh --push   # Auto-push batch without final confirmation
#   ./scripts/process-ghas-prs.sh --no-push  # Queue commits, don't push
#
# First-time setup:
#   gh auth login
#
# Requirements:
#   - GitHub CLI (gh) installed and authenticated
#   - Must be run from repository root
#   - Must have clean working directory
#   - Must be on main branch initially
#

set -euo pipefail

# Enable debug mode if DEBUG env var is set
if [[ "${DEBUG:-}" == "1" ]]; then
    set -x
fi

# Configuration
MAIN_BRANCH="main"
TEST_DIR="src"
TEST_COMMAND="npm test"
DRY_RUN=false
FORCE=false
PUSH_MODE="prompt"  # Options: "auto", "prompt", "never"

# Automated PR authors to process
# These are the GitHub app/bot usernames
declare -a AUTOMATED_AUTHORS=(
    "dependabot[bot]"        # Dependabot dependency/security updates
    "copilot-autofix[bot]"   # GitHub Copilot Autofix for CodeQL
)

# User-specified authors (overrides default if set)
declare -a USER_AUTHORS=()

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --author)
            USER_AUTHORS+=("$2")
            shift 2
            ;;
        --all)
            # Use default authors (already set)
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --push)
            PUSH_MODE="auto"
            shift
            ;;
        --no-push)
            PUSH_MODE="never"
            shift
            ;;
        -h|--help)
            grep '^#' "$0" | grep -v '#!/bin/bash' | sed 's/^# //' | sed 's/^#//'
            exit 0
            ;;
        *)
            echo -e "${RED}[ERROR]${NC} Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Use user authors if specified, otherwise use defaults
if [[ ${#USER_AUTHORS[@]} -gt 0 ]]; then
    AUTOMATED_AUTHORS=("${USER_AUTHORS[@]}")
fi

if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}\n"
fi

if [[ "$FORCE" == true ]]; then
    echo -e "${YELLOW}FORCE MODE - All passing PRs will be merged without confirmation${NC}\n"
fi

if [[ "$PUSH_MODE" == "auto" ]]; then
    echo -e "${YELLOW}AUTO-PUSH MODE - Commits will be pushed automatically after merging${NC}\n"
elif [[ "$PUSH_MODE" == "never" ]]; then
    echo -e "${YELLOW}NO-PUSH MODE - Commits will be queued locally for manual push${NC}\n"
else
    echo -e "${BLUE}BATCH MODE - You'll be prompted to push all commits after merging${NC}\n"
fi

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    log_error "GitHub CLI (gh) is required but not installed"
    log_info "Install with: sudo apt-get install gh"
    log_info "Or see: https://cli.github.com/manual/installation"
    exit 1
fi

# Check if gh is authenticated
if ! gh auth status &> /dev/null; then
    log_error "GitHub CLI is not authenticated"
    log_info "Run: gh auth login"
    exit 1
fi

# Verify we're in the repo root
if [[ ! -d ".git" ]]; then
    log_error "Must be run from repository root"
    exit 1
fi

# Verify we're on main branch
current_branch=$(git branch --show-current)
if [[ "$current_branch" != "$MAIN_BRANCH" ]]; then
    log_error "Must be on $MAIN_BRANCH branch (currently on $current_branch)"
    exit 1
fi

# Verify clean working directory
if [[ -n $(git status --porcelain) ]]; then
    log_error "Working directory must be clean. Commit or stash changes first."
    exit 1
fi

log_info "Fetching latest changes from remote..."
git fetch origin

log_info "Finding automated PRs..."
log_info "Authors: ${AUTOMATED_AUTHORS[*]}"

# Get all open PRs from automated authors using GitHub CLI
pr_data=""
for author in "${AUTOMATED_AUTHORS[@]}"; do
    log_info "Querying PRs from: $author"
    # Get PR number, branch name, and title
    # Format: PR_NUMBER|BRANCH_NAME|TITLE
    prs=$(gh pr list --state open --author "$author" --json number,headRefName,title --jq '.[] | "\(.number)|\(.headRefName)|\(.title)"' || true)
    
    if [[ -n "$prs" ]]; then
        if [[ -z "$pr_data" ]]; then
            pr_data="$prs"
        else
            pr_data="$pr_data"$'\n'"$prs"
        fi
    fi
done

if [[ -z "$pr_data" ]]; then
    log_info "No open PRs found from automated authors: ${AUTOMATED_AUTHORS[*]}"
    exit 0
fi

# Count PRs
pr_count=$(echo "$pr_data" | wc -l)
log_info "Found $pr_count automated PR(s)"
echo ""
while IFS='|' read -r pr_num branch title; do
    echo "  - PR #$pr_num: $title"
done <<< "$pr_data"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Starting to process PRs..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Track results
merged_count=0
failed_count=0
skipped_count=0
declare -a merged_prs=()
declare -a failed_prs=()
declare -a skipped_prs=()

# Process each PR
while IFS='|' read -r pr_num branch title; do
    # Skip empty lines
    if [[ -z "$pr_num" || -z "$branch" ]]; then
        log_warning "Skipping empty line in PR data"
        continue
    fi
    
    echo ""
    echo "=========================================="
    log_info "Processing PR #$pr_num: $title"
    log_info "Branch: $branch"
    echo "=========================================="
    
    # Check if branch exists locally, delete if it does (we'll recreate from remote)
    if git show-ref --verify --quiet "refs/heads/$branch"; then
        log_info "Deleting stale local branch: $branch"
        git branch -D "$branch" >/dev/null 2>&1
    fi
    
    # Checkout the PR branch
    log_info "Checking out PR #$pr_num branch: $branch"
    if ! git checkout -b "$branch" "origin/$branch" --quiet; then
        log_error "Failed to checkout branch: $branch"
        skipped_prs+=("PR #$pr_num: $title (checkout failed)")
        skipped_count=$((skipped_count + 1))
        git checkout "$MAIN_BRANCH" --quiet
        continue
    fi
    
    # Run tests
    log_info "Running tests in $TEST_DIR..."
    if (cd "$TEST_DIR" && $TEST_COMMAND); then
        log_success "Tests passed for PR #$pr_num"
        
        # Switch back to main
        log_info "Switching back to $MAIN_BRANCH"
        git checkout "$MAIN_BRANCH" --quiet
        
        if [[ "$DRY_RUN" == true ]]; then
            log_warning "[DRY RUN] Would merge PR #$pr_num: $branch into $MAIN_BRANCH"
            merged_prs+=("PR #$pr_num: $title")
            merged_count=$((merged_count + 1))
        else
            # Show PR details and ask for confirmation (unless --force)
            if [[ "$FORCE" == false ]]; then
                echo ""
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                echo -e "${GREEN}✓ TESTS PASSED${NC}"
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                echo -e "${BLUE}PR #$pr_num${NC}: $title"
                echo -e "${BLUE}Branch${NC}: $branch"
                echo ""
                
                # Get PR body/description if available and format it
                pr_body=$(gh pr view "$pr_num" --json body --jq '.body' 2>/dev/null || echo "")
                if [[ -n "$pr_body" ]]; then
                    echo -e "${BLUE}Description:${NC}"
                    # Strip HTML tags and format for terminal
                    echo "$pr_body" | sed 's/<[^>]*>//g' | sed 's/&lt;/</g' | sed 's/&gt;/>/g' | sed 's/&amp;/\&/g' | head -n 15
                    echo ""
                fi
                
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                echo ""
                read -p "Merge this PR? (y/N): " -r </dev/tty
                echo ""
                
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    log_warning "Skipped PR #$pr_num (user declined)"
                    skipped_prs+=("PR #$pr_num: $title (user declined)")
                    skipped_count=$((skipped_count + 1))
                    
                    # Clean up local branch
                    git branch -D "$branch" >/dev/null 2>&1 || true
                    continue
                fi
            fi
            
            # Merge the branch
            log_info "Merging PR #$pr_num: $branch into $MAIN_BRANCH"
            # Use -S flag for signed commits (respects commit.gpgsign config)
            if git merge --no-ff -S "$branch" -m "Merge pull request #$pr_num from $branch

$title

Automatically merged by process-ghas-prs.sh after successful tests."; then
                log_success "Merged PR #$pr_num locally"
                merged_prs+=("PR #$pr_num: $title")
                merged_count=$((merged_count + 1))
                
                # Clean up local branch
                log_info "Cleaning up local branch: $branch"
                git branch -d "$branch" >/dev/null 2>&1 || true
                
                log_info "Successfully merged PR #$pr_num (queued for push)"
            else
                log_error "Merge failed for PR #$pr_num"
                failed_prs+=("PR #$pr_num: $title (merge conflict)")
                git merge --abort 2>/dev/null || true
                failed_count=$((failed_count + 1))
                # Don't exit - continue processing other PRs
            fi
        fi
    else
        log_error "Tests failed for PR #$pr_num"
        failed_prs+=("PR #$pr_num: $title (tests failed)")
        
        # Switch back to main
        log_info "Switching back to $MAIN_BRANCH"
        git checkout "$MAIN_BRANCH" --quiet
        
        # Clean up local branch
        git branch -D "$branch" >/dev/null 2>&1 || true
        
        failed_count=$((failed_count + 1))
        # Don't exit - continue processing other PRs
    fi
    
    # Separator between PRs
    echo ""
    log_info "Completed processing PR #$pr_num. Moving to next PR..."
    echo ""
    
done <<< "$pr_data"

log_info "Finished processing all PRs"
echo ""

# Summary
echo ""
echo "=========================================="
echo "               SUMMARY"
echo "=========================================="
echo ""
log_info "Total PRs processed: $pr_count"
echo ""
log_success "Successfully merged: $merged_count"
log_error "Failed tests or merge: $failed_count"
log_warning "Skipped: $skipped_count"
echo ""

# Show detailed results
if [[ ${#merged_prs[@]} -gt 0 ]]; then
    echo ""
    echo -e "${GREEN}✓ Merged PRs:${NC}"
    for pr in "${merged_prs[@]}"; do
        echo "  - $pr"
    done
fi

if [[ ${#failed_prs[@]} -gt 0 ]]; then
    echo ""
    echo -e "${RED}✗ Failed PRs:${NC}"
    for pr in "${failed_prs[@]}"; do
        echo "  - $pr"
    done
fi

if [[ ${#skipped_prs[@]} -gt 0 ]]; then
    echo ""
    echo -e "${YELLOW}⊘ Skipped PRs:${NC}"
    for pr in "${skipped_prs[@]}"; do
        echo "  - $pr"
    done
fi

if [[ "$DRY_RUN" == true ]]; then
    echo ""
    log_warning "This was a DRY RUN. Run without --dry-run to actually merge."
fi

echo ""

# Handle batch push based on mode
if [[ "$DRY_RUN" == false && $merged_count -gt 0 ]]; then
    if [[ "$PUSH_MODE" == "never" ]]; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log_info "Commits queued locally (not pushed)"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        log_info "To push all commits:"
        echo "  git push origin $MAIN_BRANCH"
        echo ""
        log_info "To rollback all merges:"
        echo "  git reset --hard origin/$MAIN_BRANCH"
        echo ""
    elif [[ "$PUSH_MODE" == "prompt" ]]; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log_info "Ready to push $merged_count merged PR(s)"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo -e "${GREEN}Merged PRs ready to push:${NC}"
        for pr in "${merged_prs[@]}"; do
            echo "  - $pr"
        done
        echo ""
        log_info "To rollback before pushing: git reset --hard origin/$MAIN_BRANCH"
        echo ""
        read -p "Push all commits to remote now? (y/N): " -r </dev/tty
        echo ""
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "Pushing $merged_count commit(s) to remote..."
            if timeout 30s git push origin "$MAIN_BRANCH" 2>&1; then
                log_success "Successfully pushed all commits - PRs will auto-close on GitHub"
            else
                push_exit_code=$?
                if [[ $push_exit_code -eq 124 ]]; then
                    log_error "Push timed out after 30s - likely credential issue"
                    log_info "Try running: gh auth setup-git"
                else
                    log_error "Failed to push to remote (exit code: $push_exit_code)"
                fi
                echo ""
                log_warning "Commits are still queued locally. You can:"
                echo "  - Fix credentials and retry: git push origin $MAIN_BRANCH"
                echo "  - Rollback all merges: git reset --hard origin/$MAIN_BRANCH"
            fi
        else
            log_info "Push cancelled. Commits queued locally."
            echo ""
            log_info "To push later: git push origin $MAIN_BRANCH"
            log_info "To rollback: git reset --hard origin/$MAIN_BRANCH"
        fi
    else  # auto mode
        log_info "Auto-pushing $merged_count commit(s) to remote..."
        if timeout 30s git push origin "$MAIN_BRANCH" 2>&1; then
            log_success "Successfully pushed all commits - PRs will auto-close on GitHub"
        else
            push_exit_code=$?
            if [[ $push_exit_code -eq 124 ]]; then
                log_error "Push timed out after 30s - likely credential issue"
                log_info "Try running: gh auth setup-git"
            else
                log_error "Failed to push to remote (exit code: $push_exit_code)"
            fi
            echo ""
            log_warning "Commits are still queued locally. You can:"
            echo "  - Fix credentials and retry: git push origin $MAIN_BRANCH"
            echo "  - Rollback all merges: git reset --hard origin/$MAIN_BRANCH"
        fi
    fi
fi

# Return to main branch
git checkout "$MAIN_BRANCH" --quiet

exit 0