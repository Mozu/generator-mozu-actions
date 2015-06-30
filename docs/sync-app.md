# Creating a Sync App

The tools for uploading and syncing Mozu Actions require a Mozu Application to "run under". Even if you are working on a Mozu Application, your tools will sync it under the credentials of a different one, which you can call your *sync app*. Your sync app belongs to you as a developer; you can have one sync app per environment, and configure it permanently for all local apps you work on.

Create your Sync App as you would any application, by navigating to Applications in Developer Center and creating a new one.

Click "Create New Application".

Give your application a short, memorable name and ID that have something to do with "sync" and your identity.

The application will appear in your applications list. Click the gear icon in the right of the row and click "Edit".

In the application editor, click the left tab labeled "Packages".

Navigate to the subsection "Behaviors".

Click "Select Behaviors" to begin adding the required behaviors to your app. (Behaviors are permissions.)

In the leftmost panel, select "Developer". Check the checkbox for the "Developer Read" permission.

Do the same for the "Developer Asset" permissions.

Click "Save". Your Behaviors subsection should now list the allowed behaviors.

Your Sync app is now configured to allow sync. Note the Application Key and Shared Secret (click "Show" to reveal the Shared Secret).