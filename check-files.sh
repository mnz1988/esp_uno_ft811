#!/bin/bash

    # Check if any of the specified files have changed in the latest commit
    if git diff HEAD^ HEAD --name-only | grep -Eq '^(light\.json|global\.json|raw\.json)$'; then
        echo "🛑 - Changes detected in light, global, raw files. Build canceled."
        exit 0 # Exit code 0 tells Vercel to ignore the build
    else
        echo "✅ - No relevant changes detected. Build can proceed."
        exit 1 # Exit code 1 (or any non-zero) tells Vercel to build
    fi
